export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value || 0));
export const dateLabel = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '—';
export const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
// Prefixes and accents match first; tolerate one typo in words of four or more letters.
function nearWord(a,b) {
    if(Math.abs(a.length-b.length)>1)return false;
    const matrix=Array.from({length:a.length+1},(_,i)=>[i]);
    for(let j=0;j<=b.length;j++)matrix[0][j]=j;
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
        matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
        if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])matrix[i][j]=Math.min(matrix[i][j],matrix[i-2][j-2]+1);
    }
    return matrix[a.length][b.length]<=1;
}
export function similarNames(items,query,limit=8) {
    const q=normalize(query).replace(/\s+/g,' '),digits=q.replace(/\D/g,'');
    if(!q)return items.slice(0,limit);
    return items.map(item=>{
        const name=normalize(item.name).replace(/\s+/g,' '),words=name.split(' ');
        const score=name===q?0:name.startsWith(q)?1:name.includes(q)?2:
            digits&&/^[\d\s()+.-]+$/.test(q)&&String(item.phone||'').replace(/\D/g,'').includes(digits)?2:
            q.split(' ').every(part=>words.some(word=>word.startsWith(part)||(part.length>=4&&nearWord(part,word))))?3:Infinity;
        return {item,score};
    }).filter(row=>Number.isFinite(row.score)).sort((a,b)=>a.score-b.score||a.item.name.localeCompare(b.item.name,'pt-BR')).slice(0,limit).map(row=>row.item);
}
export function previousServices(rows,catalog) {
    const seen=new Set();
    return rows.filter(row=>!row.canceled).slice().sort((a,b)=>b.day.localeCompare(a.day)||String(b.created_at||'').localeCompare(String(a.created_at||''))).flatMap(row=>{
        if(seen.has(row.service_name))return [];
        seen.add(row.service_name);
        // History stores names, not catalog IDs. Ambiguous or renamed items need manual selection.
        const names=row.service_name.split(' + ');
        const matches=names.map(name=>catalog.filter(item=>item.active&&item.name===name));
        const ids=matches.every(list=>list.length===1)?matches.map(list=>list[0].id):[];
        const whole=catalog.filter(item=>item.active&&item.name===row.service_name);
        const resolved=whole.length===1&&names.length===1?whole.map(item=>item.id):whole.length===0?ids:[];
        const available=resolved.length>0&&new Set(resolved).size===resolved.length;
        return [{...row,catalog_ids:available?resolved:[],current_price:available?catalog.filter(item=>resolved.includes(item.id)).reduce((sum,item)=>sum+Number(item.price),0):null}];
    }).slice(0,5);
}
export function addDays(iso, days) {
    const date = new Date(iso + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0,10);
}
export function period(kind, today) {
    if (kind === 'day') return {start:today,end:today};
    if (kind === 'week') { const day = new Date(today+'T12:00:00Z').getUTCDay(); const start=addDays(today,day===0?-6:1-day); return {start,end:addDays(start,6)}; }
    return {start:today.slice(0,7)+'-01',end:addDays(new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),1,12)).toISOString().slice(0,10),-1)};
}
export function totals(rows) {
    const active=rows.filter(s=>!s.canceled);
    const amount=active.reduce((sum,s)=>sum+Math.round(Number(s.amount)*100),0)/100;
    const commission=active.reduce((sum,s)=>sum+Math.round(Number(s.commission||0)*100),0)/100;
    return {count:active.length,amount,commission,net:Math.round((amount-commission)*100)/100,average:active.length?amount/active.length:0};
}
export function csv(rows) {
    return '\uFEFF'+rows.map(row=>row.map(value=>{
        let text=String(value??'');
        if (/^[\s]*[=+@-]/.test(text)) text="'"+text;
        return '"'+text.replace(/"/g,'""')+'"';
    }).join(';')).join('\r\n');
}
export function anniversaryReached(first,today) {
    if (!first) return false;
    const d=new Date(first+'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear()+1);
    return d.toISOString().slice(0,10)<=today;
}
