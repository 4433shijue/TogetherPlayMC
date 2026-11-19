const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const aliases = [['海边','海岸','海滩'], ['挖矿','矿洞','矿石'], ['木头','原木','木材'], ['吃的','食物','食品']];
const stopWords = new Set(['我们','你们','这个','那个','一下','今天','现在','什么','可以','帮我','记得','之前']);
export function memoryTerms(text) {
  const normalized = String(text).toLowerCase();
  const words = new Set([...segmenter.segment(normalized)].filter(s => s.isWordLike && s.segment.length > 1 && !stopWords.has(s.segment)).map(s => s.segment));
  for (const group of aliases) if (group.some(w => normalized.includes(w))) group.forEach(w => words.add(w));
  return words;
}

// Retrieval is local: old, relevant memories remain available without another API call.
export function retrieveMemories(memories, { query = '', world, dimension, limit = 18, budget = 6500, selective = false } = {}) {
  const wanted = memoryTerms(query), now = Date.now();
  const recall=/记得|记住|回忆|之前|上次|以前|偏好|喜欢|习惯|还记|我们一起/.test(query);
  if(selective&&(/^(你好|嗨|哈[哈]+|嗯|好的?|谢谢|收到|晚安)[呀啊呢哦!！。\s]*$/.test(query)))return [];
  const candidates = memories.filter(m => {
    if (m.world && m.world !== world || m.kind === 'protection') return false;
    if (m.dimension && m.dimension !== dimension) return false;
    if (['home','meeting'].includes(m.kind)) {
      try { return m.world === world && JSON.parse(m.text).dimension === dimension; } catch { return false; }
    }
    return true;
  }).map(m => {
    const words = memoryTerms(m.text);
    const relevance = [...wanted].reduce((sum, word) => sum + (words.has(word) || m.text.toLowerCase().includes(word) ? 5 : 0), 0);
    const age = Math.max(0, now - Date.parse(m.created || 0)) / 86400000;
    return { ...m, relevance, score: relevance + (m.kind === 'fact' ? 2 : 0) + (['home','meeting'].includes(m.kind) ? 3 : 0) + (m.source === 'user' ? .5 : 0) + 1 / (1 + (Number.isFinite(age) ? age : 999)) };
  }).filter(m=>!selective||recall||m.relevance>0).sort((a,b) => b.score - a.score || b.created.localeCompare(a.created));
  const result = [], seen = new Set();
  let used = 0;
  for (const m of candidates) {
    const key = m.text.trim();
    if (seen.has(key) || used + key.length > budget) continue;
    result.push(m); seen.add(key); used += key.length;
    if (result.length >= limit) break;
  }
  return result;
}

export function memoryEvidence(store,m,now=Date.now()){
  const evidence=store.get('memoryEvidence:'+m.id,{});
  const source=m.source==='user'?'玩家确认':evidence.source==='stated'?'玩家原话':'伙伴推测，尚未确认';
  const transient=Boolean(m.world)&&m.kind==='place';
  const stale=transient&&now-Date.parse(m.created)>7*86400000;
  const meta=store.get('memoryMeta:'+m.id,{status:'active',category:'fact',resolved:false}),revisions=store.get('memoryRevisions:'+m.id,[]);
  return {...m,continuity:meta,revisions,evidenceLabel:source,quote:evidence.original??'',stale,evidence:{source,original:evidence.original??'',stale,note:stale?'旧地点或物品观察，当前状况需要重新确认':transient?'当时记下的世界信息，不保证当前仍然相同':''}};
}
