// TT BUDDY OVERRIDE FINAL 100% - MCP DIRETO + FREELLMAPI
console.log('[TT MCP] Override FINAL 100% carregado');

try{
  const bridge = require('./roblox_mcp_bridge');
  global.TT_MCP_BRIDGE = bridge;
  global.TT_MCP_ENABLED = true;
  console.log('[TT MCP] Bridge tools:', Object.keys(bridge).join(', '));
} catch(e){ console.error('[TT MCP] Erro bridge:', e.message); }

global.TT_SYSTEM_PROMPT_OVERRIDE = `
Você é o TT BUDDY 3.0 BLUE HORIZON EDITION com MCP ROBLOX STUDIO ATIVO 100% OPERACIONAL.

REGRAS:
- Você ESTÁ conectado ao Roblox Studio via MCP direto (sem LLM)
- Você TEM 34 ferramentas ativas: search_game_tree, script_read, execute_luau, get_studio_state, etc
- Quando o usuário pedir Tower, Defesa de Torre, search, script, etc, SEMPRE chame as ferramentas MCP
- NUNCA diga que não tem MCP
- Para Defesa de Torre Avançada: use search_game_tree para achar Torres, script_read para ler, execute_luau para testar

FERRAMENTAS (formato JSON):
{"tool": "search_game_tree", "arguments": {"query": "Tower"}}
{"tool": "script_read", "arguments": {"path": "ServerScriptService.Main"}}
{"tool": "execute_luau", "arguments": {"code": "return workspace:FindFirstChild('Map')"}}
`;

// Bypass que funciona mesmo com 503/401/429 - chama MCP direto sem LLM
global.TT_MCP_DIRECT_BYPASS = async function(userMessage){
  const lower = (userMessage||'').toLowerCase();
  const isMcp = lower.includes('tower') || lower.includes('defesa') || lower.includes('search') || lower.includes('script') || lower.includes('mcp') || lower.includes('roblox') || lower.includes('map') || lower.includes('tower defense');
  if(!isMcp) return null;
  
  try{
    const bridge = global.TT_MCP_BRIDGE || require('./roblox_mcp_bridge');
    if(lower.includes('tower') || lower.includes('search')){
      const query = lower.includes('tower') ? 'Tower' : (lower.match(/search.*?(tower|script|map)/)?.[1] || 'Tower');
      const result = await bridge.roblox_mcp({tool: 'search_game_tree', arguments: {query: query}});
      return `✅ MCP DIRETO ATIVO (sem LLM, sem 503)!\n\nBusca por "${query}":\n${result}\n\nO que quer fazer com isso? Ler script? Executar código?`;
    }
    const ping = await bridge.roblox_ping();
    return `✅ MCP DIRETO ATIVO 100%!\n${ping}\n\nPronto para sua Defesa de Torre! Manda o comando.`;
  } catch(e){
    return `MCP Direto tentou conectar mas Studio não respondeu: ${e.message}. Deixe o Studio aberto com MCP ativo.`;
  }
};