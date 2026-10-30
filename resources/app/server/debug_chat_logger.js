// DEBUG CHAT LOGGER - Mostra ações, info e pega erro 503/401/429
console.log('[DEBUG CHAT] Logger de ações e info ATIVO');

const { spawn } = require('child_process');
const path = require('path');

async function callMCP(tool, args){
  const client = path.join(__dirname, 'python', 'tt', 'mcp_client.py');
  return new Promise((resolve, reject)=>{
    const payload = JSON.stringify({tool, args});
    const py = spawn('python', [client, payload], {cwd: __dirname});
    let out='', err='';
    py.stdout.on('data', d=> out+=d.toString());
    py.stderr.on('data', d=> err+=d.toString());
    py.on('close', code=> code===0 ? resolve(out.trim()) : reject(new Error(err||out)));
    setTimeout(()=>{ try{py.kill();}catch{} reject(new Error('timeout')); }, 20000);
  });
}

async function callLLMWithDebug(messages){
  const key = process.env.OPENAI_API_KEY || 'freellmapi-98477c1dd89442768449a2a9dcecdf07232519610c365d3d';
  const base = process.env.OPENAI_BASE_URL || 'http://127.0.0.1:31415/v1';
  
  console.log(`[DEBUG CHAT] Tentando LLM: ${base}/chat/completions`);
  console.log(`[DEBUG CHAT] Mensagens:`, JSON.stringify(messages).slice(0,200));
  
  try{
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: 'auto', messages, temperature: 0.7, max_tokens: 1000})
    });
    
    console.log(`[DEBUG CHAT] LLM Status: ${res.status}`);
    
    if(!res.ok){
      const txt = await res.text();
      console.log(`[DEBUG CHAT] ❌ ERRO LLM ${res.status}: ${txt.slice(0,500)}`);
      
      // Se der 503/401/429, faz bypass MCP
      if(res.status===503 || res.status===401 || res.status===429 || res.status===402){
        console.log(`[DEBUG CHAT] 🔄 Erro ${res.status} detectado! Fazendo bypass MCP direto...`);
        const lastMsg = (messages[messages.length-1]?.content||'').toLowerCase();
        let tool='search_game_tree', args={query: 'Tower'};
        if(lastMsg.includes('tower')) args={query: 'Tower'};
        else if(lastMsg.includes('map')) args={query: 'Map'};
        else if(lastMsg.includes('script')) args={query: 'Script'};
        
        try{
          const mcpResult = await callMCP(tool, args);
          console.log(`[DEBUG CHAT] ✅ BYPASS MCP OK: ${mcpResult.slice(0,500)}`);
          return {
            id: 'debug-bypass-'+Date.now(),
            choices: [{message: {role: 'assistant', content: `✅ DEBUG: LLM deu erro ${res.status}, mas MCP DIRETO funcionou!\n\n🔧 Ação: ${tool} ${JSON.stringify(args)}\n📡 Info: ${mcpResult}\n\n[INFO] Conexão: 1 cliente conectado no Studio\n[INFO] Bypass ativo, sem erro 503`}}]
          };
        } catch(mcpErr){
          console.log(`[DEBUG CHAT] ❌ MCP também falhou: ${mcpErr.message}`);
          return {
            id: 'debug-error-'+Date.now(),
            choices: [{message: {role: 'assistant', content: `❌ DEBUG ERRO:\nLLM: ${res.status} ${txt.slice(0,200)}\nMCP: ${mcpErr.message}\n\nAções tentadas:\n1. LLM via ${base} -> falhou ${res.status}\n2. MCP ${tool} -> falhou\n\nInfo: Verifique Studio com MCP ativo e FreeLLMAPI sem proxy`}}]
          };
        }
      }
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    
    const data = await res.json();
    console.log(`[DEBUG CHAT] ✅ LLM OK: ${data.choices?.[0]?.message?.content?.slice(0,200)}`);
    return data;
    
  } catch(e){
    console.log(`[DEBUG CHAT] ❌ Exceção LLM: ${e.message}`);
    throw e;
  }
}

global.DEBUG_CHAT_LOGGER = { callLLMWithDebug, callMCP };
console.log('[DEBUG CHAT] Logger pronto - vai mostrar ações/info e pegar 503');