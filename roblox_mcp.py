ï»¿from __future__ import annotations

import json

from ..mcp_client import call_tool_sync
from .registry import REGISTRY

_STUDIO_ID = None

# Tools que exigem datamodel_type no servidor oficial do Roblox
_TOOLS_COM_DATAMODEL = {
    "execute_luau", "search_game_tree", "inspect_instance",
    "script_read", "multi_edit", "script_search", "script_grep",
}


def _extract_text(r) -> str:
    """Extrai o texto de qualquer resposta MCP de forma robusta."""
    try:
        if hasattr(r, "content") and r.content:
            return "\n".join(getattr(x, "text", str(x)) for x in r.content)
        sc = getattr(r, "structuredContent", None)
        if sc:
            return json.dumps(sc, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return str(r)


def _get_studio_id():
    """Descobre e memoriza o studio_id do Studio conectado."""
    global _STUDIO_ID
    if _STUDIO_ID:
        return _STUDIO_ID
    try:
        txt = _extract_text(call_tool_sync("list_roblox_studios"))
        data = json.loads(txt)
        studios = data.get("studios") or []
        if studios and studios[0].get("id"):
            _STUDIO_ID = studios[0]["id"]
    except Exception:
        pass
    return _STUDIO_ID


def _call_mcp(tool_name, arguments=None):
    """Chama a tool; se falhar pedindo studio_id, tenta de novo com ele."""
    try:
        return call_tool_sync(tool_name, arguments or {})
    except Exception as e:
        sid = _get_studio_id()
        if sid:
            args2 = dict(arguments or {})
            args2["studio_id"] = sid
            return call_tool_sync(tool_name, args2)
        raise


def roblox_state(args: dict) -> str:
    try:
        return _extract_text(_call_mcp("get_studio_state"))
    except Exception as e:
        return f"ERRO MCP (get_studio_state): {e}"


def roblox_list(args: dict) -> str:
    try:
        return _extract_text(_call_mcp("list_roblox_studios"))
    except Exception as e:
        return f"ERRO MCP (list_roblox_studios): {e}"


def roblox_ping(args: dict) -> str:
    lines = ["== roblox_ping =="]
    sid = _get_studio_id()
    lines.append(f"studio_id: {sid or 'NAO ENCONTRADO'}")
    try:
        lines.append(_extract_text(_call_mcp("get_studio_state")))
    except Exception as e:
        lines.append(f"get_studio_state FALHOU: {e}")
    return "\n".join(lines)


def roblox_run_code(args: dict) -> str:
    """Executa codigo Luau no Studio. O resultado vem do RETURN, nao do print."""
    code = args.get("code") or args.get("script") or args.get("codigo") or ""
    mode = args.get("datamodel_type") or args.get("mode") or "Edit"
    if not str(code).strip():
        return ('Nenhum codigo Luau informado. Use: {"code": "return game.Name"}. '
                'IMPORTANTE: termine o codigo com return para receber o valor.')
    payload = {"code": str(code), "datamodel_type": str(mode)}
    falhas = []
    for nome in ("execute_luau", "run_code"):
        try:
            out = _extract_text(_call_mcp(nome, payload))
            baixo = out.lower()
            if ("unknown tool" in baixo or "no such tool" in baixo
                    or "not a valid tool" in baixo):
                falhas.append(f"{nome}: nao existe neste servidor")
                continue
            if out.strip().lower() in ("nil", ""):
                out += ("\n(obs: execute_luau devolve o valor do RETURN; print() sai "
                        "no Output do Studio. Use 'return valor' ou a tool roblox_console "
                        "para ler prints.)")
            return out
        except Exception as e:
            falhas.append(f"{nome}: {e}")
    return ("ERRO MCP: " + " | ".join(falhas)
            + "\nDica: use a tool generica roblox_mcp com o nome exato da tool.")


def roblox_console(args: dict) -> str:
    """Le as ultimas mensagens do Output do Roblox Studio."""
    arguments = {}
    for k in ("limit", "count", "lines", "maxLines"):
        if args.get(k):
            arguments[k] = args[k]
            break
    try:
        out = _extract_text(_call_mcp("get_console_output", arguments))
        try:
            maximo = int(args.get("max_chars") or 4000)
        except Exception:
            maximo = 4000
        if len(out) > maximo:
            omitidos = len(out) - maximo
            out = f"(...{omitidos} caracteres antigos omitidos...)\n" + out[-maximo:]
        return out
    except Exception as e:
        return f"ERRO MCP (get_console_output): {e}"


def roblox_tool(args: dict) -> str:
    """Executa QUALQUER tool MCP do Roblox Studio."""
    tool = args.get("tool")
    if not tool:
        return 'Use: {"tool": "inspect_instance", "arguments": {...}}'
    tool = str(tool)
    arguments = args.get("arguments") or {}
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except Exception:
            arguments = {}
    arguments = dict(arguments)

    # Injeta datamodel_type automaticamente nas tools que exigem
    if tool in _TOOLS_COM_DATAMODEL and "datamodel_type" not in arguments:
        arguments["datamodel_type"] = str(args.get("datamodel_type") or "Edit")

    try:
        out = _extract_text(_call_mcp(tool, arguments))
        baixo = out.lower()
        # Fallback: o servidor avisou que falta algum parametro
        if "required" in baixo:
            if "datamodel_type" in baixo and "datamodel_type" not in arguments:
                arguments["datamodel_type"] = "Edit"
                out = _extract_text(_call_mcp(tool, arguments))
                baixo = out.lower()
            if "studio_id" in baixo and "studio_id" not in arguments:
                sid = _get_studio_id()
                if sid:
                    arguments["studio_id"] = sid
                    out = _extract_text(_call_mcp(tool, arguments))
        return out
    except Exception as e:
        return f"ERRO MCP ({tool}): {e}"


def roblox_client_info(args: dict) -> str:
    """Diagnostico: mostra as funcoes disponiveis no tt.mcp_client."""
    import inspect
    import tt.mcp_client as m
    fns = sorted(n for n, f in inspect.getmembers(m, inspect.isfunction) if not n.startswith("_"))
    return "Funcoes em tt.mcp_client: " + ", ".join(fns)


def register():
    REGISTRY.register(
        name="roblox_state",
        description="ObtÃ©m o estado atual do Roblox Studio (modo Edit/Play, DataModels).",
        fn=roblox_state,
        category="roblox",
    )
    REGISTRY.register(
        name="roblox_list",
        description="Lista os Roblox Studios conectados ao servidor MCP.",
        fn=roblox_list,
        category="roblox",
    )
    REGISTRY.register(
        name="roblox_ping",
        description="DiagnÃ³stico rÃ¡pido da conexÃ£o MCP com o Roblox Studio (studio_id + estado).",
        fn=roblox_ping,
        category="roblox",
    )
    REGISTRY.register(
        name="roblox_run_code",
        description=("Executa cÃ³digo Luau dentro do Roblox Studio. IMPORTANTE: termine o cÃ³digo "
                     "com 'return valor' para receber o resultado (print nÃ£o Ã© capturado â€” use "
                     "roblox_console para ler o Output). ParÃ¢metros: code (obrigatÃ³rio) e "
                     "datamodel_type (Edit/Client/Server, padrÃ£o Edit)."),
        fn=roblox_run_code,
        parameters={
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "CÃ³digo Luau; termine com return"},
                "datamodel_type": {"type": "string", "description": "Edit, Client ou Server"},
            },
            "required": ["code"],
        },
        category="roblox",
    )
    REGISTRY.register(
        name="roblox_console",
        description=("LÃª as Ãºltimas mensagens do Output do Roblox Studio (Ãºtil para ver prints "
                     "e erros). ParÃ¢metro opcional: max_chars (padrÃ£o 4000)."),
        fn=roblox_console,
        category="roblox",
    )
    REGISTRY.register(
        name="roblox_mcp",
        description=("Executa qualquer ferramenta MCP do Roblox Studio (ex.: execute_luau, "
                     "inspect_instance, search_game_tree, script_read, multi_edit, script_search, "
                     "script_grep, insert_asset, search_asset, generate_mesh, generate_material, "
                     "generate_procedural_model, start_stop_play, get_console_output, "
                     "screen_capture). ParÃ¢metros: tool e arguments. datamodel_type e studio_id "
                     "sÃ£o preenchidos automaticamente quando necessÃ¡rio."),
        fn=roblox_tool,
        parameters={
            "type": "object",
            "properties": {
                "tool": {"type": "string", "description": "Nome da tool MCP"},
                "arguments": {"type": "object", "description": "Argumentos da tool"},
            },
            "required": ["tool"],
        },
        category="roblox",
    )
    REGISTRY.register(
        name="roblox_client_info",
        description="DiagnÃ³stico: mostra as funÃ§Ãµes disponÃ­veis no cliente MCP interno.",
        fn=roblox_client_info,
        category="roblox",
    )


register()
