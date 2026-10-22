import { cloud, configured, rpc } from './cloud.js';
import { esc, money, dateLabel, normalize, addDays, period, totals, csv, anniversaryReached, similarNames, previousServices } from './domain.js';

const $ = id => document.getElementById(id), app = $('app');
let state, route='home', routeArgs={}, sequence=0, recovery=false;
const owner=()=>state?.me.role==='owner';
function applyBrand(name){
    name=name?.trim() || window.BARBER_CONFIG?.shopName || 'Gestão de Barbearia';
    document.title=name;
    document.querySelectorAll('.marca-nome').forEach(el=>{el.textContent=name;});
    document.querySelector('.login-apresentacao')?.setAttribute('aria-label',name);
    $('marcaHome').setAttribute('aria-label',name+', ir para início');
    document.querySelector('.login-rodape').textContent=name;
    document.querySelector('.app-footer > span').textContent=name;
}
const call=rpc;
const icons={cut:'<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="m8 16 11-13M16 16 5 3"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',money:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.cut}</svg>`;
let noticeTimer;
function notify(message,error=false){clearTimeout(noticeTimer);$('statusMessage').textContent=message;$('statusMessage').className='status-message '+(error?'status-error':'status-success');noticeTimer=setTimeout(()=>{$('statusMessage').textContent='';},error?15000:8000);}
function errorMessage(error){
    if(!navigator.onLine)return 'Sem conexão. Seu formulário foi mantido; reconecte-se e tente novamente.';
    const msg=error?.message||'Não foi possível concluir. Tente novamente.';
    if(/barber_account_api.*schema cache|function.*barber_account_api/i.test(msg))return 'O acesso individual ainda precisa ser ativado no banco de dados.';
    if(/Ação desconhecida|service_update|service_time/i.test(msg))return 'A edição de atendimentos precisa da migração 006 aplicada no banco de dados.';
    if(/invalid login credentials/i.test(msg))return 'E-mail ou senha incorretos.';
    if(/email not confirmed/i.test(msg))return 'Confirme o e-mail recebido antes de entrar.';
    if(/fetch|network/i.test(msg))return 'Não foi possível conectar. Confira sua internet e tente novamente.';
    return msg;
}
function breakdown(rows,key,title){
    const grouped=new Map();for(const row of rows.filter(s=>!s.canceled)){const name=row[key]||'Não informado';if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(row);}
    return `<section><h3>${title}</h3>${[...grouped.entries()].map(([name,items])=>{const t=totals(items);return `<div class="registro record-main"><div><strong>${esc(name)}</strong><small>${t.count} atendimento${t.count===1?'':'s'}</small></div><div class="record-amount"><strong>${money(t.amount)}</strong><small>Comissão ${money(t.commission)}</small></div></div>`;}).join('')||empty('Sem registros.')}</section>`;
}
const field=(id,label,type='text',value='',extra='')=>`<div class="form-field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const select=(id,label,options,value='')=>`<div class="form-field"><label for="${id}">${label}</label><select id="${id}" name="${id}">${options.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
const button=(text,action,args='',kind='botao-secundario')=>`<button type="button" class="${kind}" data-action="${action}" data-id="${esc(args)}">${text}</button>`;
const empty=text=>`<p class="vazio">${text}</p>`;
const submit=text=>`<button type="submit" class="botao-principal">${text}</button>`;
function panel(title,subtitle,content){return `<section class="painel"><div class="page-title"><div><h2 tabindex="-1">${esc(title)}</h2><p>${esc(subtitle)}</p></div>${button('← Início','home','','link-texto')}</div>${content}</section>`;}
function metrics(rows){const t=totals(rows);return `<div class="cards metric-cards"><div class="card"><small>Atendimentos</small><strong>${t.count}</strong></div><div class="card"><small>Faturamento</small><strong>${money(t.amount)}</strong></div><div class="card"><small>Comissões</small><strong>${money(t.commission)}</strong></div><div class="card"><small>${owner()?'Após comissões':'Média por atendimento'}</small><strong>${money(owner()?t.net:t.average)}</strong></div></div>${owner()?'<p class="hint">Após comissões não representa lucro: outras despesas não estão incluídas.</p>':''}`;}
function download(name,content,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function serviceRows(rows,canCancel=false,canEdit=canCancel){return rows.length?`<div class="records">${rows.map(s=>`<article class="registro ${s.canceled?'canceled':''}"><div class="record-main"><div><strong>${esc(s.client_name||s.barber_name)}</strong><p>${esc(s.service_name)}</p><small>${dateLabel(s.day)} · ${esc(s.service_time?String(s.service_time).slice(0,5):'Horário não informado')} · ${esc(s.barber_name)} · ${esc(s.payment)}</small></div><div class="record-amount"><strong>${money(s.amount)}</strong>${s.commission!==undefined?`<small>Comissão ${money(s.commission)}</small>`:''}</div></div>${s.canceled?`<p class="hint">Cancelado: ${esc(s.cancel_reason)}</p>`:canEdit&&owner()?`<div class="action-row"><button type="button" class="link-texto" data-action="editService" data-id="${esc(s.id)}" data-day="${esc(s.day)}">Editar atendimento</button>${canCancel?button('Cancelar registro','cancel',s.id,'botao-excluir'):''}</div>`:''}</article>`).join('')}</div>`:empty('Nenhum atendimento encontrado neste período.');}
function bindForm(id,handler){$(id)?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;if(form.dataset.busy)return;form.dataset.busy='true';const btn=form.querySelector('[type=submit]'),previous=btn.textContent;btn.disabled=true;btn.textContent='Salvando…';try{await handler(Object.fromEntries(new FormData(form)),form);}catch(error){notify(errorMessage(error),true);}finally{delete form.dataset.busy;btn.disabled=false;btn.textContent=previous;}});}
async function save(action,payload,next=route,args=routeArgs){await call(action,payload);if(await go(next,args))notify('Salvo com sucesso.');else notify('O registro foi salvo, mas não foi possível atualizar a tela. Use Atualizar antes de tentar novamente.',true);}
function showLogin(){sequence++;state=null;route='home';routeArgs={};applyBrand();$('headerPerfil').textContent='Minha conta';$('syncTime').textContent='';app.innerHTML='';$('appPrincipal').style.display='none';$('siteHome').hidden=true;$('telaLogin').hidden=false;$('telaLogin').style.display='flex';$('pendingAccess').hidden=true;$('loginForm').hidden=false;$('loginAjuda').hidden=false;$('loginSenha').value='';$('loginEmail').focus();}
function showPendingAccess(email,message='Confirme seu e-mail e solicite a liberação. O painel só será aberto após a aprovação.'){
    $('siteHome').hidden=true;$('appPrincipal').style.display='none';$('telaLogin').hidden=false;$('telaLogin').style.display='flex';
    $('loginForm').hidden=true;$('loginAjuda').hidden=true;$('loginErro').textContent='';$('pendingAccess').hidden=false;
    $('pendingEmail').textContent=email||'';$('pendingMessage').textContent=message;
    const subject='Solicitação de acesso — Gestão de Barbearia';
    const body=`Olá, Luan. Solicito acesso à Gestão de Barbearia.\n\nMeu e-mail de cadastro: ${email||''}`;
    $('requestAccessEmail').href=`mailto:luannascimentopsp@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    $('requestAccessWhatsApp').href=`https://wa.me/5583998083995?text=${encodeURIComponent(body)}`;
    $('pendingTitle').focus?.();
}
async function go(page='home',args={}){
    const current=++sequence;route=page;routeArgs=args;app.setAttribute('aria-busy','true');
    try{
        const next=await call('state');if(current!==sequence)return;
        if(next.access==='pending'){state=null;showPendingAccess(next.email);return true;}
        state=next;applyBrand(state.shop.name);
        $('siteHome').hidden=true;$('telaLogin').style.display='none';$('appPrincipal').style.display='block';$('headerPerfil').textContent=state.me.name;
        document.querySelectorAll('.menu-inferior button').forEach(b=>{const selected=b.dataset.page===page||(page==='newService'&&b.dataset.page==='services')||(page==='history'&&b.dataset.page==='clients');b.classList.toggle('ativo',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
        const views={home,services,clients,history,newService,editService,goals,team,catalog,account,audit,requests};
        if(page==='requests'&&!state.is_admin)throw new Error('Acesso reservado ao administrador.');
        if(['team','catalog','audit'].includes(page)&&!owner())throw new Error('Acesso reservado ao dono.');
        await (views[page]||home)(args,current);if(current!==sequence)return;
        window.scrollTo({top:0,behavior:'instant'});app.querySelector('h2[tabindex],h1')?.focus({preventScroll:true});
        $('syncTime').textContent=`Atualizado às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
        return true;
    }catch(error){if(current!==sequence)return;notify(errorMessage(error),true);if(!state||/acesso ainda|confirme seu e-mail|entre na sua conta|JWT|session/i.test(error?.message||''))showLogin();}
    finally{if(current===sequence)app.removeAttribute('aria-busy');}
}
async function home(args={},token){
    const monthStart=`${state.today.slice(0,7)}-01`,weekday=new Date(state.today+'T12:00:00Z').getUTCDay();
    const weekStart=addDays(state.today,weekday===0?-6:1-weekday),weekEnd=addDays(weekStart,5);
    const balanceStart=monthStart<weekStart?monthStart:weekStart,balanceEnd=weekEnd>state.today?weekEnd:state.today;
    const balanceRows=await call('report',{start:balanceStart,end:balanceEnd});if(token!==sequence)return;
    const monthTotals=totals(balanceRows.filter(s=>s.day>=monthStart&&s.day<=state.today));
    const weekTotals=totals(balanceRows.filter(s=>s.day>=weekStart&&s.day<=weekEnd));
    const rate=Number(state.me.commission_rate??50),recent=state.services.filter(s=>!s.canceled).slice(0,4);
    monthTotals.commission=Math.round((monthTotals.amount*rate/100+Number.EPSILON)*100)/100;
    const balanceCards=(t,commissionDetail='Comissões dos serviços cadastrados')=>`<div class="resumo-grid" aria-label="Totais do período">${[['money','Total dos serviços',money(t.amount),`${t.count} atendimento${t.count===1?'':'s'} registrado${t.count===1?'':'s'}`],['target',`Saldo de comissão · ${rate}%`,money(t.commission),commissionDetail]].map(([i,label,value,detail])=>`<div class="resumo-item"><span class="resumo-icone">${icon(i)}</span><div><small>${label}</small><strong>${value}</strong><p>${detail}</p></div></div>`).join('')}</div>`;
    const shortcuts=[['services','calendar','Atendimentos','Consulte seus registros'],['clients','people','Clientes','Conheça cada história'],...(owner()?[['team','cut','Meu perfil','Nome e comissão'],['services','money','Financeiro','Acompanhe os resultados']]:[])];
    app.innerHTML=`<div class="dashboard-home"><div class="dashboard-intro"><div><span class="eyebrow">MINHA GESTÃO</span><h1 tabindex="-1">${owner()?'Seu painel':'Olá, '+esc(state.me.name.split(' ')[0])}</h1></div><span class="dashboard-data">${icon('calendar')}${dateLabel(state.today)}</span></div>
    <section class="saldo-periodos" aria-label="Saldos do mês e da semana"><section class="saldo-periodo"><div class="secao-cabecalho"><h2>Este mês</h2><small>${dateLabel(monthStart)} até ${dateLabel(state.today)}</small></div>${balanceCards(monthTotals,`Calculada sobre o total do mês a ${rate}%`)}</section><section class="saldo-periodo"><div class="secao-cabecalho"><h2>Esta semana</h2><small>${dateLabel(weekStart)} a ${dateLabel(weekEnd)} · segunda a sábado</small></div>${balanceCards(weekTotals)}</section></section>
    ${state.is_admin?`<section class="painel painel-aprovacoes"><div class="secao-cabecalho"><div><span class="eyebrow">CONTROLE DE ACESSO</span><h2>Solicitações pendentes</h2></div><strong>${(state.pending_requests||[]).length}</strong></div><p>Novos usuários só entram na gestão depois da sua aprovação.</p>${button('Revisar solicitações ↗','requests','','botao-principal')}</section>`:''}
    <section class="banner-dashboard"><div class="banner-conteudo"><span class="eyebrow">PRECISÃO. ESTILO. IDENTIDADE.</span><h2>Tradição no corte.<br><em>Evolução na gestão.</em></h2><p>Seu talento merece uma rotina à altura.<br>Cuide de cada atendimento, do início ao fim.</p>${button(icon('cut')+' Registrar serviço ↗','newService','','botao-principal')}</div><span class="banner-selo">CUIDADO EM CADA DETALHE</span></section>
    <section><div class="secao-cabecalho"><h2>Tudo ao seu alcance</h2><small>Seu dia, bem organizado.</small></div><div class="cards-dashboard">${shortcuts.map(([page,i,label,detail])=>`<button class="card-dashboard" data-action="${page}"><span class="icone-card">${icon(i)}</span><span><strong>${label}</strong><small>${detail}</small></span><span class="atalho-seta">↗</span></button>`).join('')}</div></section>
    <div class="dashboard-detalhes"><section class="dashboard-painel"><div class="secao-cabecalho"><h2>Últimos atendimentos</h2>${button('Ver todos ↗','services','','link-texto')}</div>${recent.length?recent.map(s=>`<div class="atendimento-linha"><span class="atendimento-avatar">${esc(s.client_name.charAt(0))}</span><div class="atendimento-nome"><strong>${esc(s.client_name)}</strong><small>${esc(s.service_name)}</small></div><div class="atendimento-valor"><strong>${money(s.amount)}</strong><small>${dateLabel(s.day)}</small></div></div>`).join(''):`<div class="estado-vazio">${icon('cut')}<strong>Uma nova história começa na cadeira.</strong><p>Registre o primeiro serviço para acompanhar os resultados.</p></div>`}</section>
    <div class="dashboard-lateral"><section class="meta-destaque">${icon('target')}<span class="eyebrow">UM PASSO ALÉM</span><h2>Seu próximo objetivo.</h2><p>Metas claras para cada dia, semana e mês.</p>${button('Acompanhar metas ↗','goals')}</section></div></div></div>`;
}
async function requests(){
    if(!state?.is_admin)throw new Error('Acesso reservado ao administrador.');
    const pending=await call('admin_pending');
    app.innerHTML=panel('Solicitações de acesso','Aprove somente pessoas que você reconhece. O cadastro precisa ter o e-mail confirmado.',pending.length?`<div class="records">${pending.map(user=>`<article class="registro"><div class="record-main"><div><strong>${esc(user.email)}</strong><small>Cadastro em ${new Date(user.created_at).toLocaleDateString('pt-BR')}</small></div>${button('Aprovar acesso','approveUser',user.id,'botao-principal')}</div></article>`).join('')}</div>`:empty('Nenhuma solicitação pendente.'));
}
async function services(args={},token){
    const range=args.start?args:period('month',state.today);
    app.innerHTML=panel(owner()?'Atendimentos e financeiro':'Meus atendimentos','Consulte serviços, valores e comissões por período.',`<div class="action-row">${button('＋ Registrar serviço','newService','','botao-principal')}${button('Metas','goals')}${owner()?button('Tabela de preços','catalog'):''}</div><div class="botoes-periodo">${['day','week','month'].map((p,i)=>button(['Hoje','Esta semana','Este mês'][i],'period',p)).join('')}</div><form id="reportForm" class="form-grid">${field('start','De','date',range.start,'required')}${field('end','Até','date',range.end,'required')}${submit('Consultar')}</form><div id="reportResult" aria-live="polite">${empty('Carregando registros…')}</div>`);
    bindForm('reportForm',async data=>{if(data.start>data.end)throw new Error('A data inicial deve ser anterior à final.');await go('services',data);});
    const rows=await call('report',{...range,barber_id:args.barber_id||''});if(token!==sequence)return;
    $('reportResult').innerHTML=`<p class="hint">Período: ${dateLabel(range.start)} a ${dateLabel(range.end)}${args.barber_id?' · '+esc(state.profiles.find(p=>p.id===args.barber_id)?.name||''):''}</p>`+metrics(rows)+`<details><summary>Resumo por profissional e serviço</summary>${owner()?breakdown(rows,'barber_name','Por profissional'):''}${breakdown(rows,'service_name','Por serviço')}${breakdown(rows,'payment','Por pagamento')}</details><div class="action-row">${button('Exportar CSV','exportReport')}${button('Imprimir relatório','print')}</div>`+serviceRows(rows,true);
    $('reportResult').querySelector('[data-action=exportReport]').onclick=()=>download('atendimentos.csv',csv([['Data','Horário','Cliente','Profissional','Serviço','Pagamento','Valor','Comissão','Situação'],...rows.map(s=>[s.day,s.service_time||'',s.client_name,s.barber_name,s.service_name,s.payment,s.amount,s.commission,s.canceled?'Cancelado':'Confirmado'])]),'text/csv;charset=utf-8');
}
async function editService(args,token){
    if(!owner())throw new Error('Acesso reservado ao dono.');
    const day=args.day||state.today,rows=await call('report',{start:day,end:day});if(token!==sequence)return;
    const service=rows.find(row=>row.id===args.id&&!row.canceled);if(!service)throw new Error('Atendimento não encontrado ou já cancelado.');
    const clients=state.clients.filter(client=>client.active||client.id===service.client_id);
    const clientOptions=clients.map(client=>[client.id,client.name+(client.active?'':' · Arquivado')]);
    app.innerHTML=panel('Editar atendimento','Altere cliente, serviço, valor, data, horário ou pagamento. Atendimentos antigos sem horário registrado podem continuar sem esse dado. Se mudar o valor, a comissão será recalculada pela taxa atual.',`<form id="editServiceForm">${select('client_id','Cliente',clientOptions,service.client_id)}${field('service_name','Serviço(s)','text',service.service_name,'required minlength="1" maxlength="1000"')}${field('amount','Valor do serviço','number',Number(service.amount).toFixed(2),'required min="0.01" max="1000000" step="0.01"')}${field('day','Data do atendimento','date',service.day,`required max="${state.today}"`)}${field('service_time','Horário do atendimento','time',service.service_time?String(service.service_time).slice(0,5):'')}${select('payment','Pagamento',[['','Selecione'],...['Pix','Dinheiro','Cartão','Outro'].map(value=>[value,value])],service.payment)}${submit('Salvar alterações')}</form>`);
    bindForm('editServiceForm',async data=>{
        const amount=Number(data.amount);if(!Number.isFinite(amount)||amount<=0||amount>1000000)throw new Error('Informe um valor válido para o serviço.');
        await save('service_update',{...data,id:service.id,amount},'services',{start:data.day,end:data.day});
    });
}
function clientPicker(clients,onSelect){
    const input=$('clientLookup'),list=$('clientOptions'),hidden=$('client_id'),status=$('clientLookupStatus');
    let matches=[],active=-1;
    function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
    function choose(client){hidden.value=client.id;input.value=client.name;input.setCustomValidity('');status.textContent=`Selecionado: ${client.name}${client.phone?' · '+client.phone:''}`;close();onSelect(client);}
    function render(){
        matches=similarNames(clients,input.value);active=-1;
        list.innerHTML=matches.map((c,i)=>`<li id="clientOption${i}" role="option" aria-selected="false" data-index="${i}"><strong>${esc(c.name)}</strong><small>${esc(c.phone||'Sem telefone')} · Último atendimento: ${dateLabel(c.last_day)}</small></li>`).join('');
        list.hidden=!matches.length;input.setAttribute('aria-expanded',String(!!matches.length));input.removeAttribute('aria-activedescendant');
        status.textContent=matches.length?'Escolha um cliente da lista. Use as setas e Enter ou toque no nome.':'Nenhum cliente encontrado. Você pode cadastrar um novo cliente abaixo.';
    }
    input.addEventListener('input',()=>{hidden.value='';input.setCustomValidity('Escolha um cliente da lista de sugestões.');onSelect(null);render();});
    input.addEventListener('focus',render);
    input.addEventListener('blur',close);
    list.addEventListener('pointerdown',event=>event.preventDefault());
    list.addEventListener('click',event=>{const option=event.target.closest('[data-index]');if(option){const client=matches[Number(option.dataset.index)];input.focus();choose(client);}});
    input.addEventListener('keydown',event=>{
        if(event.key==='Escape'){close();return;}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
            event.preventDefault();if(list.hidden)render();if(!matches.length)return;
            active=(active+(event.key==='ArrowDown'?1:active<0?0:-1)+matches.length)%matches.length;
            [...list.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));
            input.setAttribute('aria-activedescendant',`clientOption${active}`);list.children[active].scrollIntoView?.({block:'nearest'});
        }else if(event.key==='Enter'&&!list.hidden){event.preventDefault();if(active>=0)choose(matches[active]);}
    });
}
function newService(args={},token){
    const clients=state.clients.filter(c=>c.active),catalog=state.catalog.filter(c=>c.active);
    const currentTime=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
    app.innerHTML=panel('Registrar serviço','Os preços e a comissão são calculados pelo sistema.',`<form id="serviceForm"><div class="client-picker"><label for="clientLookup">Cliente</label><input id="clientLookup" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="clientOptions" aria-describedby="clientLookupStatus" autocomplete="off" placeholder="Digite o nome ou telefone do cliente" maxlength="100" required><input id="client_id" name="client_id" type="hidden"><ul id="clientOptions" class="suggestion-list" role="listbox" aria-label="Clientes sugeridos" hidden></ul><p id="clientLookupStatus" class="hint" role="status">Digite para encontrar um cliente cadastrado.</p></div>${button('Cadastrar um novo cliente','clients','','link-texto')}<p class="registro">Profissional: <strong>${esc(state.me.name)}</strong></p><section id="previousServices" class="previous-services" aria-label="Sugestões do histórico" aria-live="polite"><p class="hint">Selecione um cliente para ver os serviços anteriores.</p></section><fieldset><legend>Serviços realizados</legend>${catalog.length?'':empty('Cadastre seus serviços e preços para começar.')}${catalog.length?'':button('Cadastrar serviços e preços','catalog','','link-texto')}<div class="catalog-grid">${catalog.map(c=>`<label class="service-choice"><input type="checkbox" name="catalog_ids" value="${esc(c.id)}"><span>${esc(c.name)}<small>${money(c.price)}</small></span></label>`).join('')}</div></fieldset><p class="service-total">Total <strong id="serviceTotal">${money(0)}</strong></p><div class="form-grid">${field('day','Data do atendimento','date',state.today,`required max="${state.today}" ${owner()?'':`min="${addDays(state.today,-7)}"`}`)}${field('service_time','Horário do atendimento','time',currentTime,'required')}${select('payment','Pagamento',[['','Selecione'],...['Pix','Dinheiro','Cartão','Outro'].map(v=>[v,v])])}</div>${submit('Salvar atendimento')}</form>`);
    $('serviceForm').onchange=()=>{$('serviceTotal').textContent=money([...document.querySelectorAll('[name=catalog_ids]:checked')].reduce((n,input)=>n+Number(catalog.find(c=>c.id===input.value).price),0));};
    let historyRequest=0;
    async function loadHistory(client){
        const request=++historyRequest,container=$('previousServices');
        if(!client){container.innerHTML='<p class="hint">Selecione um cliente para ver os serviços anteriores.</p>';return;}
        container.innerHTML='<p class="hint">Consultando serviços anteriores…</p>';
        const current=()=>token===sequence&&request===historyRequest&&container.isConnected;
        try{
            const rows=await call('history',{client_id:client.id});if(!current())return;
            const suggestions=previousServices(rows,catalog);
            container.innerHTML=`<h3>Serviços anteriores de ${esc(client.name)}</h3>`+(suggestions.length?'<p class="hint">Toque em uma sugestão para adicionar aos serviços realizados. Valores da tabela atual.</p>'+suggestions.map((s,i)=>`<article class="registro"><strong>${esc(s.service_name)}</strong><p>Última vez: ${dateLabel(s.day)}</p>${s.catalog_ids.length?`<button type="button" class="botao-secundario" data-previous="${i}">Adicionar ao atendimento · ${money(s.current_price)}</button>`:'<p class="hint">Serviço alterado ou indisponível na tabela atual. Escolha os serviços abaixo.</p>'}</article>`).join(''):empty('Este cliente ainda não tem atendimentos anteriores.'));
            container.querySelectorAll('[data-previous]').forEach(btn=>btn.onclick=()=>{
                const suggestion=suggestions[Number(btn.dataset.previous)];
                document.querySelectorAll('[name=catalog_ids]').forEach(input=>{if(suggestion.catalog_ids.includes(input.value))input.checked=true;});
                $('serviceForm').onchange();notify('Serviços adicionados. Confira a seleção antes de salvar.');
            });
        }catch(error){if(current()){container.innerHTML='<p class="hint">Não foi possível consultar o histórico. Você pode escolher os serviços abaixo.</p><button type="button" class="link-texto">Tentar novamente</button>';container.querySelector('button').onclick=()=>loadHistory(client);}}
    }
    clientPicker(clients,loadHistory);
    const request_id=crypto.randomUUID();
    bindForm('serviceForm',async(data,form)=>{const catalog_ids=new FormData(form).getAll('catalog_ids');if(!data.client_id||!data.payment||!catalog_ids.length)throw new Error('Selecione cliente, serviços e pagamento.');await save('service_add',{...data,barber_id:state.me.id,catalog_ids,request_id},'services',{start:data.day,end:data.day});});
}
function existingNameSuggestions(formId,items,editingId,action,label,describe){
    const input=$(formId).querySelector('[name=name]'),container=document.createElement('div');
    container.className='existing-suggestions';container.setAttribute('aria-live','polite');input.parentElement.append(container);
    input.addEventListener('input',()=>{
        const matches=input.value.trim().length>=2?similarNames(items.filter(item=>item.id!==editingId),input.value,5):[];
        container.innerHTML=matches.length?`<p class="hint">${label}</p>`+matches.map(item=>button(`<strong>${esc(item.name)}</strong><small>${esc(describe(item))}</small>`,action,item.id,'existing-suggestion')).join(''):'';
    });
}
function clients(args={}){
    const editing=state.clients.find(c=>c.id===args.id);
    app.innerHTML=panel('Clientes','Cadastro, retornos e histórico completo de cada cliente.',`<details ${editing?'open':''}><summary>${editing?'Editar cliente':'＋ Cadastrar cliente'}</summary><form id="clientForm">${field('name','Nome completo','text',editing?.name||'','required minlength="2" maxlength="100" autocomplete="name"')}${field('phone','Telefone / WhatsApp (opcional)','tel',editing?.phone||'','maxlength="20" autocomplete="tel"')}<label for="notes">Observações (opcional)</label><textarea id="notes" name="notes" maxlength="2000">${esc(editing?.notes||'')}</textarea>${submit(editing?'Salvar alterações':'Cadastrar cliente')}</form></details><div class="search-row">${field('clientSearch','Pesquisar nome ou telefone','search','','placeholder="Digite para pesquisar…"')}<label class="check-label"><input id="showInactive" type="checkbox"> Incluir arquivados</label></div><div id="clientList"></div><details><summary>Retornos sugeridos · 20 dias</summary><p class="hint">Sugestões com base no último atendimento registrado. Não são agendamentos confirmados.</p><div id="returnList"></div></details>`);
    bindForm('clientForm',data=>save('client_save',{...data,id:editing?.id},'clients'));
    existingNameSuggestions('clientForm',state.clients,editing?.id,'editClient','Clientes parecidos já cadastrados. Toque para abrir o cadastro existente.',c=>`${c.phone||'Sem telefone'}${c.active?'':' · Arquivado'}`);
    function list(){const q=normalize($('clientSearch').value);const rows=state.clients.filter(c=>(c.active||$('showInactive').checked)&&(normalize(c.name).includes(q)||c.phone.includes(q)));$('clientList').innerHTML=rows.length?rows.map(c=>`<article class="registro"><div class="record-main"><div><strong>${esc(c.name)}${c.active?'':' · Arquivado'}</strong><p>${esc(c.phone||'Sem telefone')}</p><small>Último atendimento: ${dateLabel(c.last_day)}</small></div>${button('Ver histórico ↗','history',c.id,'link-texto')}</div><div class="action-row">${owner()||c.created_by===state.me.id?button('Editar','editClient',c.id,'link-texto'):''}${owner()?button(c.active?'Arquivar':'Reativar','clientActive',c.id,'link-texto'):''}</div></article>`).join(''):empty('Nenhum cliente encontrado.');}
    $('clientSearch').oninput=list;$('showInactive').onchange=list;list();
    const returns=state.clients.filter(c=>c.active&&c.last_day&&addDays(c.last_day,20)<=addDays(state.today,3)).sort((a,b)=>a.last_day.localeCompare(b.last_day));
    $('returnList').innerHTML=returns.map(c=>`<article class="registro"><strong>${esc(c.name)}</strong><p>Retorno sugerido: ${dateLabel(addDays(c.last_day,20))}</p>${button('Consultar histórico','history',c.id,'link-texto')}</article>`).join('')||empty('Nenhum retorno próximo.');
}
async function history(args,token){
    const client=state.clients.find(c=>c.id===args.id);if(!client)throw new Error('Cliente não encontrado.');
    app.innerHTML=panel(client.name,'Histórico dos atendimentos registrados nesta conta.',empty('Carregando histórico…'));
    const rows=await call('history',{client_id:client.id});if(token!==sequence)return;
    const first=rows.length?rows[rows.length-1].day:'',monthly=[];
    for(let n=11;n>=0;n--){const d=new Date(state.today+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-n);const key=d.toISOString().slice(0,7);monthly.push([key,rows.filter(s=>s.day.startsWith(key)).reduce((v,s)=>v+Number(s.amount),0)]);}
    app.innerHTML=panel(client.name,client.phone||'Histórico completo do cliente.',`${button('← Voltar aos clientes','clients','','link-texto')}<p class="registro">${esc(client.notes||'Nenhuma observação cadastrada.')}</p><div class="cards"><div class="card"><small>Total de atendimentos</small><strong>${rows.length}</strong></div><div class="card"><small>Total gasto</small><strong>${money(totals(rows).amount)}</strong></div><div class="card"><small>Primeiro atendimento</small><strong>${dateLabel(first)}</strong></div></div>${anniversaryReached(first,state.today)?'<p class="registro retorno-proximo">Cliente com histórico de um ano ou mais.</p>':''}<h3>Gastos nos últimos 12 meses</h3><div class="monthly-grid">${monthly.map(([key,amount])=>`<div><span>${key.slice(5)}/${key.slice(0,4)}</span><strong>${money(amount)}</strong></div>`).join('')}</div><div class="action-row">${button('Exportar histórico CSV','exportHistory')}${button('Imprimir histórico','print')}</div><h3>Todos os serviços realizados</h3>${serviceRows(rows,false,true)}`);
    app.querySelector('[data-action=exportHistory]').onclick=()=>download('historico-cliente.csv',csv([['Data','Horário','Serviço','Profissional','Pagamento','Valor'],...rows.map(s=>[s.day,s.service_time||'',s.service_name,s.barber_name,s.payment,s.amount])]),'text/csv;charset=utf-8');
}
function goals(args={}){
    const id=owner()?(args.id||state.me.id):state.me.id,goal=state.goals.find(g=>g.profile_id===id),locked=!owner()&&!!goal,target=state.profiles.find(p=>p.id===id)||state.me;
    const rows=state.services.filter(s=>!s.canceled&&(target.role==='owner'||s.barber_id===id));
    app.innerHTML=panel('Metas do mês',`${state.month.slice(5)}/${state.month.slice(0,4)} · Valores de faturamento em reais.`,`<p class="registro">${locked?'Suas metas estão definidas até o fim deste mês. Novos valores poderão ser escolhidos no mês seguinte.':owner()?'Defina e ajuste suas metas. Os ajustes ficam registrados.':'Defina os três valores juntos. Depois de salvar, eles ficarão fixos até o mês seguinte.'}</p><form id="goalsForm"><div class="goal-grid">${[['daily','Diária','day'],['weekly','Semanal','week'],['monthly','Mensal','month']].map(([key,label,kind])=>{const range=period(kind,state.today),done=totals(rows.filter(s=>s.day>=range.start&&s.day<=range.end)).amount,amount=Number(goal?.[key]||0),pct=amount?Math.min(100,done/amount*100):0;return `<section class="bloco-info"><h3>${label}</h3><p>${dateLabel(range.start)}${range.start!==range.end?' a '+dateLabel(range.end):''}</p><strong>${money(done)}</strong><p>de ${money(amount)}</p><div class="meta-progresso" role="progressbar" aria-label="Meta ${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><div class="meta-progresso-barra" style="width:${pct}%"></div></div>${field(key,`Meta ${label.toLowerCase()} (R$)`,'number',goal?.[key]||'','min="0.01" max="1000000" step="0.01" required '+(locked?'disabled':''))}</section>`;}).join('')}</div>${locked?'':submit(goal?'Salvar metas do mês':'Definir metas do mês')}</form>`);
    $('goalProfile')?.addEventListener('change',event=>go('goals',{id:event.target.value}));bindForm('goalsForm',data=>save('goals_save',{...data,profile_id:id},'goals',{id}));
}
function team(){
    app.innerHTML=panel('Meu perfil','Dados vinculados somente à sua conta.',`<form id="profileForm">${field('name','Seu nome','text',state.me.name,'required minlength="2" maxlength="100"')}${field('commission_rate','Minha comissão (%)','number',state.me.commission_rate,'required min="0" max="100" step="0.01"')}<p class="hint">A comissão vale apenas para novos atendimentos. Seu e-mail de acesso é ${esc(state.me.email)}.</p>${submit('Salvar perfil')}</form>`);
    bindForm('profileForm',data=>save('profile_save',{...data,id:state.me.id},'team'));
}
function catalog(args={}){
    const editing=state.catalog.find(c=>c.id===args.id);
    app.innerHTML=panel('Tabela de preços','Alterações de preço valem apenas para novos atendimentos.',`<form id="catalogForm" class="form-grid">${field('name','Nome do serviço','text',editing?.name||'','required minlength="2" maxlength="100"')}${field('price','Preço (R$)','number',editing?.price||'','required min="0.01" max="1000000" step="0.01"')}${submit(editing?'Salvar preço':'Adicionar serviço')}</form>${state.catalog.map(c=>`<div class="registro record-main"><div><strong>${esc(c.name)}</strong><p>${money(c.price)} · ${c.active?'Ativo':'Desativado'}</p></div><div>${button('Editar','editCatalog',c.id,'link-texto')}${button(c.active?'Desativar':'Ativar','catalogActive',c.id,'link-texto')}</div></div>`).join('')}`);
    bindForm('catalogForm',data=>save('catalog_save',{...data,id:editing?.id,active:editing?.active??true},'catalog'));
    existingNameSuggestions('catalogForm',state.catalog,editing?.id,'editCatalog','Serviços parecidos já cadastrados. Toque para editar o serviço existente.',c=>`${money(c.price)} · ${c.active?'Ativo':'Desativado'}`);
}
function account(){
    app.innerHTML=panel('Minha conta','Seu espaço individual de gestão.',`<p class="registro">${esc(state.me.email)}</p><div class="action-row">${button('Meu perfil','team')}${button('Tabela de preços','catalog')}${button('Registro de alterações','audit')}</div><details><summary>Dados do meu negócio (opcional)</summary><form id="shopForm">${field('name','Nome do negócio','text',state.shop.name,'maxlength="100"')}${field('phone','Telefone','tel',state.shop.phone,'maxlength="20"')}${field('address','Endereço','text',state.shop.address,'maxlength="300"')}${submit('Salvar dados')}</form></details><details ${recovery?'open':''}><summary>Alterar minha senha</summary><form id="passwordForm">${field('newPassword','Nova senha','password','','required minlength="10" autocomplete="new-password"')}${field('confirmPassword','Confirme a senha','password','','required minlength="10" autocomplete="new-password"')}${submit('Alterar senha')}</form></details><details><summary>Exportar meus dados</summary><p class="hint">A exportação contém apenas os registros desta conta. Guarde o arquivo em local privado.</p>${button('Exportar meus registros','backup')}</details>${button('Sair da conta','logout','','botao-excluir')}`);
    bindForm('shopForm',data=>save('settings_save',data,'account'));
    bindForm('passwordForm',async data=>{if(data.newPassword!==data.confirmPassword)throw new Error('As senhas não coincidem.');const {error}=await cloud.auth.updateUser({password:data.newPassword});if(error)throw error;recovery=false;const {error:signOutError}=await cloud.auth.signOut({scope:'global'});if(signOutError)throw signOutError;showLogin();notify('Senha alterada. Entre novamente com sua nova senha.');});
}
async function audit(args,token){const rows=await call('audit');if(token!==sequence)return;const labels={client_save:'Cliente salvo',service_add:'Atendimento registrado',service_update:'Atendimento editado',goals_save:'Metas alteradas',profile_save:'Profissional salvo',profile_active:'Acesso do profissional alterado',client_active:'Situação do cliente alterada',catalog_save:'Tabela de preços alterada',service_cancel:'Atendimento cancelado',settings_save:'Dados da barbearia alterados',legacy_import:'Histórico antigo importado'};app.innerHTML=panel('Registro de alterações','Últimas 100 ações administrativas e de cadastro.',rows.map(row=>`<article class="registro"><strong>${esc(labels[row.action]||row.action)}</strong><p>${esc(row.actor_name)} · ${new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p></article>`).join('')||empty('Nenhuma alteração registrada.'));}

document.addEventListener('click',async event=>{
    const el=event.target.closest('[data-action]');if(!el||el.disabled)return;const {action,id}=el.dataset;
    try{
        if(action==='editService'){await go('editService',{id,day:el.dataset.day});return;}
        if(['home','services','clients','newService','goals','team','catalog','account','audit','history','requests'].includes(action)){await go(action,{id});return;}
        if(action==='approveUser'){await call('admin_approve',{id});await go('requests');notify('Acesso aprovado. A pessoa já pode entrar na gestão.');return;}
        if(action==='period')await go('services',period(id,state.today));
        if(action==='editClient')await go('clients',{id});
        if(action==='editProfile')await go('team',{id});
        if(action==='editCatalog')await go('catalog',{id});
        if(action==='profileGoals')await go('goals',{id});
        if(action==='refresh')await go(route,routeArgs);
        if(action==='print')window.print();
        if(action==='logout'){const {error}=await cloud.auth.signOut();if(error)throw error;recovery=false;showLogin();notify('Você saiu da conta.');}
        if(action==='backup'){const data=await call('backup');download('meus-registros-'+state.today+'.json',JSON.stringify(data,null,2));notify('Exportação preparada. Guarde o arquivo em local privado.');}
        if(action==='clientActive'){const c=state.clients.find(c=>c.id===id);await save('client_active',{id,active:!c.active},'clients');}
        if(action==='catalogActive'){const c=state.catalog.find(c=>c.id===id);await save('catalog_save',{...c,active:!c.active},'catalog');}
        if(action==='cancel'){const reason=prompt('Motivo do cancelamento (mínimo de 5 caracteres). O registro será preservado para auditoria:');if(reason===null)return;await save('service_cancel',{id,reason},'services',routeArgs);}
    }catch(error){notify(errorMessage(error),true);}
});
document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>go(el.dataset.page));$('marcaHome').onclick=()=>go();
$('loginForm').onsubmit=async event=>{event.preventDefault();const btn=$('btnEntrar');btn.disabled=true;$('loginErro').textContent='';try{if(!configured)throw new Error('O acesso online ainda precisa ser configurado.');const {error}=await cloud.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginSenha').value});if(error)throw error;$('loginSenha').value='';await go();}catch(error){$('loginErro').textContent=errorMessage(error);}finally{btn.disabled=false;}};
$('firstAccess').onclick=async()=>{if(!configured){$('loginErro').textContent='O acesso online ainda não foi ativado.';return;}if(!$('loginForm').reportValidity())return;$('firstAccess').disabled=true;try{if($('loginSenha').value.length<10)throw new Error('Use pelo menos 10 caracteres para criar sua senha.');const email=$('loginEmail').value.trim();const {error}=await cloud.auth.signUp({email,password:$('loginSenha').value,options:{emailRedirectTo:new URL('./',location.href).href}});if(error)throw error;$('loginSenha').value='';showPendingAccess(email,'Cadastro recebido. Confirme o e-mail enviado pelo sistema e solicite sua liberação por um dos canais abaixo. A gestão só será aberta após aprovação.');}catch(error){$('loginErro').textContent=errorMessage(error);}finally{$('firstAccess').disabled=false;}};
$('pendingCheck').onclick=async()=>{const {data,error}=await cloud.auth.getSession();if(error){notify(errorMessage(error),true);return;}if(!data.session){showLogin();$('loginErro').textContent='Entre após confirmar seu e-mail para consultar a aprovação.';return;}await go();};
$('pendingExit').onclick=async()=>{const {error}=await cloud.auth.signOut();if(error){notify(errorMessage(error),true);return;}showLogin();};
$('forgotPassword').onclick=async()=>{if(!configured){$('loginErro').textContent='O acesso online ainda não foi ativado.';return;}if(!$('loginEmail').reportValidity())return;$('forgotPassword').disabled=true;try{const {error}=await cloud.auth.resetPasswordForEmail($('loginEmail').value.trim(),{redirectTo:new URL('./',location.href).href});if(error)throw error;$('loginErro').textContent='Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.';}catch(error){$('loginErro').textContent=errorMessage(error);}finally{$('forgotPassword').disabled=false;}};
window.addEventListener('offline',()=>notify('Sem conexão. Reconecte-se antes de salvar.',true));window.addEventListener('online',()=>notify('Conexão restabelecida. Use Atualizar para buscar os dados mais recentes.'));
async function boot(){
    applyBrand();
    $('setupNotice').hidden=configured;
    if(cloud){cloud.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){recovery=true;showLogin();setTimeout(()=>go('account'),0);}if(event==='SIGNED_OUT'){recovery=false;showLogin();}if(event==='SIGNED_IN'&&state?.me.id!==session?.user.id){recovery=false;showLogin();setTimeout(()=>go(),0);}});const {data,error}=await cloud.auth.getSession();if(error)notify(errorMessage(error),true);if(data.session&&!recovery)await go();}
    $('bootMessage').hidden=true;if($('pendingAccess').hidden)$('loginForm').hidden=false;
}
boot().catch(error=>{notify(errorMessage(error),true);$('bootMessage').hidden=true;$('loginForm').hidden=false;});


