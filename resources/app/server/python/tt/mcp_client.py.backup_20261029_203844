ï»¿r"""
Cliente MCP oficial do Roblox Studio - TT 2.0 JARVIS Purple Edition.
Versao PERSISTENTE: mantem UMA conexao viva enquanto o TT estiver rodando.

- A primeira chamada conecta e descobre o studio_id (com retry).
- As proximas chamadas reutilizam a mesma conexao (rapidas, indicador verde).
- Se a conexao cair ou o Studio reiniciar, reconecta sozinho.
- Heartbeat de 55s mantem a sessao viva mesmo sem uso.

API:
    call_tool(nome, argumentos)      -> coroutine (compativel com asyncio.run)
    call_tool_sync(nome, argumentos) -> chamada direta, sem asyncio
    desconectar()                    -> encerra a conexao (chame ao fechar o TT)
"""

import asyncio
import json
import os
import threading
from contextlib import AsyncExitStack, asynccontextmanager

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import CallToolResult, TextContent

SEM_STUDIO_ID = {"list_roblox_studios", "http_get", "skill", "store_image", "upload_image"}
LEGADO = {"studio_list": "list_roblox_studios", "studio_query": "get_studio_state"}
INTERVALO_HEARTBEAT = 55


def get_server_params():
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        raise RuntimeError("A variavel LOCALAPPDATA nao foi encontrada.")
    bat_path = os.path.join(local_app_data, "Roblox", "mcp.bat")
    if not os.path.isfile(bat_path):
        raise FileNotFoundError(f"Servidor MCP oficial nao encontrado: {bat_path}")
    return StdioServerParameters(command="cmd.exe", args=["/c", bat_path], env=None)


def _resultado_texto(texto):
    return CallToolResult(content=[TextContent(type="text", text=texto)], isError=False)


class ConexaoPersistente:
    """Mantem uma unica sessao MCP viva numa event loop dedicada."""

    def __init__(self):
        self._loop = None
        self._thread = None
        self._stack = None
        self._session = None
        self._studio_id = None
        self._lock = None
        self._heartbeat = None

    def _garantir_loop(self):
        if self._thread is None or not self._thread.is_alive():
            self._loop = asyncio.new_event_loop()
            self._thread = threading.Thread(target=self._loop.run_forever, daemon=True, name="tt-mcp")
            self._thread.start()

    async def _pegar_lock(self):
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def _descobrir_studio(self, session, tentativas=10, pausa=3.0):
        for tentativa in range(1, tentativas + 1):
            try:
                r = await session.call_tool("list_roblox_studios", {})
            except Exception:
                return None
            texto = r.content[0].text if r.content else ""
            try:
                studios = json.loads(texto).get("studios", [])
            except Exception:
                studios = []
            if studios:
                return studios[0]["id"]
            if tentativa < tentativas:
                print(f"[mcp] Studio ainda nao visto ({tentativa}/{tentativas}). Aguardando {pausa:.0f}s...")
                await asyncio.sleep(pausa)
        return None

    async def _conectar_interno(self):
        if self._session is not None:
            return
        stack = AsyncExitStack()
        read, write = await stack.enter_async_context(stdio_client(get_server_params()))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        self._stack = stack
        self._session = session
        sid = await self._descobrir_studio(session)
        if sid is None:
            await self._fechar_interno()
            raise RuntimeError(
                "Nenhum Roblox Studio conectado ao servidor MCP. "
                "Abra o Studio com o projeto e mantenha "
                "'Habilitar Studio como servidor MCP' ligado."
            )
        self._studio_id = sid
        if self._heartbeat is None or self._heartbeat.done():
            self._heartbeat = asyncio.get_running_loop().create_task(self._heartbeat_loop())

    async def _fechar_interno(self):
        stack, self._stack = self._stack, None
        self._session = None
        self._studio_id = None
        if stack is not None:
            try:
                await stack.aclose()
            except Exception:
                pass

    async def _executar(self, nome, argumentos):
        if nome not in SEM_STUDIO_ID and "studio_id" not in argumentos and self._studio_id:
            argumentos["studio_id"] = self._studio_id
        resultado = await self._session.call_tool(nome, argumentos)
        if resultado.isError and "studio_id" in argumentos:
            novo = await self._descobrir_studio(self._session, tentativas=3, pausa=2.0)
            if novo and novo != self._studio_id:
                self._studio_id = novo
                argumentos["studio_id"] = novo
                resultado = await self._session.call_tool(nome, argumentos)
        return resultado

    async def _chamar_interno(self, nome, argumentos):
        lock = await self._pegar_lock()
        async with lock:
            nome = LEGADO.get(nome, nome)
            for chave in ("place_path", "place_id"):
                argumentos.pop(chave, None)

            if nome == "studio_open":
                await self._conectar_interno()
                return _resultado_texto(f"Studio conectado (studio_id: {self._studio_id}).")

            await self._conectar_interno()
            try:
                return await self._executar(nome, argumentos)
            except Exception:
                await self._fechar_interno()
                await self._conectar_interno()
                return await self._executar(nome, argumentos)

    async def _heartbeat_loop(self):
        while True:
            await asyncio.sleep(INTERVALO_HEARTBEAT)
            try:
                lock = await self._pegar_lock()
                async with lock:
                    if self._session is None:
                        continue
                    await self._session.call_tool("list_roblox_studios", {})
            except Exception:
                try:
                    lock = await self._pegar_lock()
                    async with lock:
                        await self._fechar_interno()
                except Exception:
                    pass

    async def chamar(self, nome, argumentos=None):
        self._garantir_loop()
        fut = asyncio.run_coroutine_threadsafe(
            self._chamar_interno(nome, dict(argumentos or {})), self._loop
        )
        return await asyncio.wrap_future(fut)

    def chamar_sync(self, nome, argumentos=None):
        self._garantir_loop()
        fut = asyncio.run_coroutine_threadsafe(
            self._chamar_interno(nome, dict(argumentos or {})), self._loop
        )
        return fut.result()

    async def desconectar(self):
        lock = await self._pegar_lock()
        async with lock:
            await self._fechar_interno()


CONEXAO = ConexaoPersistente()


async def call_tool(nome, argumentos=None):
    """Mesma assinatura de sempre; agora reutiliza a conexao persistente."""
    return await CONEXAO.chamar(nome, argumentos)


def call_tool_sync(nome, argumentos=None):
    """Versao sem asyncio: chame direto de qualquer parte do TT."""
    return CONEXAO.chamar_sync(nome, argumentos)


def desconectar():
    """Encerra a conexao persistente (use ao fechar o TT)."""
    CONEXAO._garantir_loop()
    fut = asyncio.run_coroutine_threadsafe(CONEXAO.desconectar(), CONEXAO._loop)
    fut.result(timeout=10)


@asynccontextmanager
async def mcp_session():
    """Sessao temporaria (mantida por compatibilidade com os testes antigos)."""
    params = get_server_params()
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


async def list_tools():
    async with mcp_session() as session:
        result = await session.list_tools()
        return result.tools


async def _test():
    try:
        tools = await list_tools()
        print(f"Ferramentas do Roblox Studio ({len(tools)}) - conexao temporaria ok.")

        print("\nAbrindo conexao PERSISTENTE (get_studio_state)...")
        r = await call_tool("get_studio_state")
        print(r.content[0].text if r.content else r)

        print("\n>> OLHE O PAINEL DO STUDIO: '1 cliente conectado' deve FICAR aceso.")
        print(">> Mantendo a sessao viva por 60 segundos...")
        for restante in (45, 30, 15):
            await asyncio.sleep(15)
            print(f"   ...sessao viva ({forrestante}s restantes)")
        print("\nValidado. Encerrando o script (a conexao fecha junto).")

    except Exception as exc:
        print(f"Falha MCP: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    asyncio.run(_test())

