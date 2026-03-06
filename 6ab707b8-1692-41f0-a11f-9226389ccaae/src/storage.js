import { get, set, del } from "idb-keyval";

const KEY = "diligencias_multi_v1";

export async function loadState() {
  try {
    const data = await get(KEY);
    return data ?? null;
  } catch (e) {
    console.error("Falha ao carregar IndexedDB:", e);
    return null;
  }
}

export async function saveState(state) {
  try {
    await set(KEY, state);
    return true;
  } catch (e) {
    console.error("Falha ao salvar IndexedDB:", e);
    return false;
  }
}

export async function clearState() {
  try {
    await del(KEY);
    return true;
  } catch (e) {
    console.error("Falha ao limpar IndexedDB:", e);
    return false;
  }
}
