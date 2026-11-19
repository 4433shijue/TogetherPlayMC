import { randomUUID } from 'node:crypto';
import { actionNames, validateAction } from './actions.mjs';

export const planTool = {
  name: 'task_plan',
  description: '为当前玩家目标列出或修改剩余步骤。每步写 title 与一个 action，可带 item/count/mode/坐标等目标条件。步骤只是计划，不会自动执行；随后调用 game_action。已完成步骤保留。步骤完成只由真实游戏结果判定。需要未知坐标时先 observe。不要把永久 follow/wait 当成可完成目标。',
  parameters: { type: 'object', properties: {
    steps: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'object', properties: {
      title: {type:'string'}, action: {type:'string',enum:actionNames.filter(a=>!['follow','wait','set_home','set_meeting'].includes(a))},
      item: {type:'string'}, count: {type:'integer',minimum:1,maximum:64}, mode:{type:'string'},
      x:{type:'number'}, y:{type:'number'}, z:{type:'number'}, size:{type:'integer',minimum:3,maximum:7}, entityId:{type:'integer'}
    }, required:['title','action'], additionalProperties:false } }
  }, required:['steps'], additionalProperties:false }
};

function achieved(args, result) {
  if (!result?.ok || result.verified === false) return 0;
  switch (args.action) {
    case 'collect': return Math.min(result.blocksBroken ?? 0, result.collectedCount ?? (result.pickedUp ?? []).reduce((n,v)=>n+v.count,0));
    case 'craft': case 'smelt': return result.created ?? 0;
    case 'fell_tree': return result.complete===true?result.trees??0:0;
    // A retry starts at the same entrance and may traverse already opened cells.
    // Keep partial receipts, but never add those repeated distances together.
    case 'mine': return result.complete===true&&result.returned===true?result.advanced??0:0;
    case 'retrieve': return result.surfaced===true?result.received??0:0;
    case 'prepare_tools': return result.complete===true?Math.min(...(result.ready??[]).map(i=>i.count),args.count??1):0;
    case 'give': return result.received ?? 0;
    case 'farm': return result.plots ?? 0;
    case 'chest': return args.mode === 'inspect' ? 1 : result.count ?? 0;
    case 'organize': return result.moved ?? 0;
    case 'fight': return result.defeated === true ? 1 : 0;
    case 'recover': return result.recovered === true ? 1 : 0;
    case 'build': return result.verified === true || result.tilled > 0 ? 1 : 0;
    default: return result.complete === false ? 0 : 1;
  }
}

export class PlanJournal {
  constructor(store, role, world, dimension) { Object.assign(this, {store,role,world,dimension}); }
  list() { return this.store.plans(this.role,this.world,this.dimension); }
  get(id) { return this.list().find(p=>p.id===id); }
  save(plan) { plan.updated = new Date().toISOString(); this.store.savePlan(plan); return plan; }
  start(request, origin='player') {
    return this.save({id:randomUUID(),role:this.role,world:this.world,dimension:this.dimension,request:String(request).slice(0,2000),origin,status:'running',steps:[],receipts:[],reason:'',created:new Date().toISOString()});
  }
  outline(id, steps) {
    const plan=this.get(id); if (!plan || plan.status!=='running') throw new Error('计划已暂停或结束，请由玩家继续。');
    if (!Array.isArray(steps)||!steps.length||steps.length>16) throw new Error('计划需要 1–16 个步骤。');
    const next=steps.map(step=>{
      if (!step || typeof step.title!=='string' || !step.title.trim() || step.title.length>120) throw new Error('每一步需要简短说明。');
      const {title,...expected}=step; validateAction(expected);
      if (['follow','wait','set_home','set_meeting'].includes(expected.action)) throw new Error('跟随和地点设置请使用即时指令。');
      return {id:randomUUID(),title,expected,progress:0,status:'pending'};
    });
    if (next.every(s=>['observe','inspect_recipe'].includes(s.expected.action))) throw new Error('行动目标需要具体操作步骤，观察不能代替完成任务。');
    plan.steps=[...plan.steps.filter(s=>s.status==='done'),...next]; plan.reason='';
    return this.save(plan);
  }
  pause(id, reason='已暂停，等待继续。', status='paused') {
    const plan=this.get(id); if (!plan || ['done','cancelled'].includes(plan.status)) return plan;
    plan.status=status; plan.reason=reason; return this.save(plan);
  }
  resume(id) {
    const plan=this.get(id); if (!plan || ['done','cancelled'].includes(plan.status)) throw new Error('当前世界和维度没有可继续的这项计划。');
    plan.status='running'; plan.reason='重新观察现状，再接着未完成的步骤。'; return this.save(plan);
  }
  record(id, args, result) {
    const plan=this.get(id); if (!plan || plan.status!=='running') return plan;
    const units=achieved(args,result), step=plan.steps.find(s=>s.status==='pending');
    const receipt={at:new Date().toISOString(),args,result};
    plan.receipts.push(receipt); plan.receipts=plan.receipts.slice(-40);
    if (step && Object.entries(step.expected).every(([key,v])=>key==='count'||args[key]===v)) {
      step.progress += units;
      const target= ['collect','craft','smelt','give','farm','organize'].includes(args.action) || args.action==='chest'&&args.mode!=='inspect' ? step.expected.count??1 : 1;
      if (step.progress >= target) { step.status='done'; step.completed=receipt.at; }
    }
    plan.reason=!result.ok ? result.error : result.complete===false ? result.note||'游戏结果尚未满足完成条件。' : '';
    if (plan.steps.length && plan.steps.every(s=>s.status==='done')) { plan.status='done'; plan.reason='计划步骤已由游戏结果确认完成。'; }
    return this.save(plan);
  }
}
