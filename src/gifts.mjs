import {randomUUID} from 'node:crypto';

export const giftTool={name:'offer_gift',description:'在当前私人存档尝试送出一种游戏物品。由原角色、关系和本轮对话决定是否使用；尊重拒收和长期偏好。仅明确索要时使用 requested，否则使用 spontaneous。先按当前整合包资料判断取得难度；无法确定就视为未知。只有 dropped 回执表示已抛出，不代表玩家已拾取。',parameters:{type:'object',additionalProperties:false,properties:{itemId:{type:'string',description:'物品注册 ID'},count:{type:'integer',minimum:1,maximum:64},intent:{type:'string',enum:['requested','spontaneous']}},required:['itemId','count','intent']}};
const modes=new Set(['off','role','progress']);
const cooldown=15*60000;
// An explicit refusal vetoes the capability for this turn, including a mistaken model call.
export function declinesGift(text){return /(?:别|不用|不要|不必|不许)(?:再|特意|主动|直接)?(?:送|给我)|(?:不收|拒收)(?:礼物|东西)|我(?:想|要|打算)自己(?:去)?(?:找|挖|拿|获得|获取|收集|合成|制作)/u.test(text);}

// Proposals are ephemeral. A lost receipt is unknown and is never retried.
export class Gifts {
  constructor(chat){this.chat=chat;this.pending=null;}
  mode(){const c=this.chat;return c.world?c.store.get('gift-mode:'+c.world,'off'):'off';}
  configure(mode){if(!modes.has(mode))throw Error('礼物设置无效。');if(!this.chat.observation?.giftBridge)throw Error('请先进入支持送礼的私人单人世界。');if(mode!==this.mode()){this.chat.cancel();this.chat.store.set('gift-mode:'+this.chat.world,mode);}return {mode};}
  available(){return this.chat.observation?.giftBridge===true&&!this.chat.observation.dead&&this.mode()!=='off';}
  offer(args,signal){
    const c=this.chat,{itemId,count,intent}=args;
    if(!this.available()||signal.aborted)throw Error('本次对话不能送礼。');
    if(!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(itemId)||typeof itemId!=='string'||itemId.length>200||!Number.isInteger(count)||count<1||count>64||!['requested','spontaneous'].includes(intent)||Object.keys(args).some(k=>!['itemId','count','intent'].includes(k)))throw Error('物品或数量无效。');
    const key='gift-last:'+JSON.stringify([c.world,c.role.id]);
    if(this.pending||intent==='spontaneous'&&c.now()-c.store.get(key,-cooldown)<cooldown)throw Error('暂时不再主动送礼。');
    const gift={id:randomUUID(),session:c.client.sessionId,role:c.role.id,dimension:c.observation.dimension,itemId,count,mode:this.mode(),expires:Date.now()+15000};
    return new Promise(resolve=>{
      const end=(status,reason)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);this.pending=null;resolve({status,itemId,count,reason});};
      const abort=()=>end('unconfirmed','对话已中止，不重试。');
      const timer=setTimeout(()=>end('unconfirmed','没有收到游戏确认，不重试。'),15000);
      this.pending={gift,key,end,claimed:false};signal.addEventListener('abort',abort,{once:true});
    });
  }
  current(){
    const p=this.pending,c=this.chat;
    return p&&this.available()&&p.gift.session===c.client?.sessionId&&p.gift.role===c.role.id&&p.gift.dimension===c.observation.dimension&&p.gift.expires>Date.now()?p:null;
  }
  waiting(){const p=this.current();return p&&!p.claimed?p.gift.id:null;}
  claim(id){const p=this.current();if(!p||p.claimed||p.gift.id!==id)return {};p.claimed=true;return {gift:p.gift};}
  receipt(id,status){
    const p=this.current();if(!p?.claimed||p.gift.id!==id)return {accepted:false};
    const reasons={unavailable:'物品不存在或不能作为生存礼物。',progress:'当前存档缺少取得该物品的证据。',unsafe:'找不到安全落点或玩家已离开。',full:'背包没有足够的空位。',invalid:'物品数量超过实际堆叠上限。'};
    if(status!=='dropped'&&!Object.hasOwn(reasons,status))throw Error('未知的游戏回执。');
    if(status==='dropped')this.chat.store.set(p.key,this.chat.now());
    this.chat.log('gift_receipt',{id,itemId:p.gift.itemId,count:p.gift.count,status,dimension:p.gift.dimension});
    p.end(status,reasons[status]);return {accepted:true};
  }
}
