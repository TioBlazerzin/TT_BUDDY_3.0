#!/usr/bin/env python3
# MCP DIRETO SEM LLM - ConexÃ£o persistente com Roblox Studio
import asyncio
import json
import sys
import os
import subprocess
from pathlib import Path

MCP_BAT = Path(os.environ.get('LOCALAPPDATA', '')) / 'Roblox' / 'mcp.bat'

async def connect_roblox_mcp():
    if not MCP_BAT.exists():
        print(f"mcp.bat nao encontrado em {MCP_BAT}")
        return None
    print(f"Encontrado: {MCP_BAT}")
    print("Conectando no Roblox Studio MCP (SEM LLM)...")
    try:
        from mcp import ClientSession
        from mcp.client.stdio import stdio_client
        from mcp.client.stdio import StdioServerParameters
        server_params = StdioServerParameters(command=str(MCP_BAT), args=[], env=None)
        print("Abrindo conexao STDIO...")
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                print("Conectado! Inicializando...")
                await session.initialize()
                tools = await session.list_tools()
                print(f"\nFerramentas ({len(tools.tools)}):")
                for tool in tools.tools:
                    print(f"  - {tool.name}")
                print("\n" + "="*60)
                print("CONEXAO PERSISTENTE ATIVA - Studio deve mostrar '1 cliente conectado'")
                print("="*60)
                print("\nComandos: 1=ping, 2=state, 3=list, 4=search Tower, 7=output, 8=sair")
                while True:
                    try:
                        cmd = await asyncio.get_event_loop().run_in_executor(None, input, "\n> ")
                        cmd = cmd.strip()
                        if not cmd or cmd == "8" or cmd.lower() in ["sair", "exit"]:
                            break
                        tool_name = None
                        tool_args = {}
                        if cmd == "1" or "ping" in cmd.lower():
                            tool_name = "ping"
                        elif cmd == "2" or "state" in cmd.lower():
                            tool_name = "get_studio_state"
                        elif cmd == "3" or cmd.lower() == "list":
                            tool_name = "list"
                        elif "tower" in cmd.lower() or cmd == "4":
                            tool_name = "search_game_tree"
                            tool_args = {"query": "Tower"}
                        elif "script" in cmd.lower():
                            tool_name = "search_game_tree"
                            tool_args = {"query": "Script"}
                        elif "output" in cmd.lower() or cmd == "7":
                            tool_name = "get_output"
                            tool_args = {"limit": 100}
                        else:
                            tool_name = "search_game_tree"
                            tool_args = {"query": cmd}
                        if tool_name:
                            print(f"\nChamando {tool_name} {tool_args}...")
                            result = await session.call_tool(tool_name, arguments=tool_args)
                            print(f"\nResultado:")
                            for content in result.content:
                                if hasattr(content, 'text'):
                                    print(content.text[:3000])
                                else:
                                    print(str(content)[:3000])
                    except KeyboardInterrupt:
                        break
                    except Exception as e:
                        print(f"Erro: {e}")
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "mcp"])
        print("MCP instalado, rode de novo")
    except Exception as e:
        print(f"Erro: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("MCP DIRETO SEM LLM - Nao usa IA, nao da 402/403/503")
    asyncio.run(connect_roblox_mcp())
