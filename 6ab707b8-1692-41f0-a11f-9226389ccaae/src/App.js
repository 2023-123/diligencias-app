import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { loadState, saveState } from "./storage";

/** ===========================
 * Helpers
 * =========================== */
const PRO_URL =
  "https://play.google.com/store/apps/details?id=com.seupacote.pro";

const uid = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;

function nowLocalISOString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function dtLocalToISO(dtLocal) {
  const d = new Date(dtLocal);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

/** ===========================
 * Compressão de Imagem
 * =========================== */
async function compressImage(file, maxWidth = 1000, quality = 0.7) {
  const img = document.createElement("img");
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.onerror = reject;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL("image/jpeg", quality);
      resolve(compressed);
    };

    reader.readAsDataURL(file);
  });
}

/** ===========================
 * Modelo de dados
 * =========================== */
function makeSingleCase() {
  return {
    id: "case-default",
    titulo: "Novo Caso",
    reds: "",
    localFato: "",
    equipe: "",
    viatura: "",
    observacoes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pessoas: [],
    eventos: [],
  };
}

function emptyDB() {
  return {
    version: 2,
    caseData: makeSingleCase(),
  };
}

function normalizeImportedDB(obj) {
  const fallback = makeSingleCase();

  if (!obj) return { version: 2, caseData: fallback };

  // compatibilidade com versão antiga multi-casos
  if (Array.isArray(obj.cases) && obj.cases.length > 0) {
    const oldActive =
      obj.cases.find((c) => c.id === obj.activeCaseId) || obj.cases[0];

    return {
      version: 2,
      caseData: {
        ...fallback,
        ...oldActive,
        pessoas: Array.isArray(oldActive.pessoas) ? oldActive.pessoas : [],
        eventos: Array.isArray(oldActive.eventos) ? oldActive.eventos : [],
      },
    };
  }

  if (obj.caseData) {
    return {
      version: 2,
      caseData: {
        ...fallback,
        ...obj.caseData,
        pessoas: Array.isArray(obj.caseData.pessoas) ? obj.caseData.pessoas : [],
        eventos: Array.isArray(obj.caseData.eventos) ? obj.caseData.eventos : [],
      },
    };
  }

  return {
    version: 2,
    caseData: fallback,
  };
}

const ROLES = [
  "testemunha",
  "vítima",
  "suspeito",
  "autor",
  "informante",
  "condutor",
  "solicitante",
  "outro",
];

export default function App() {
  /** ===========================
   * Estado principal + persistência
   * =========================== */
  const [db, setDb] = useState(emptyDB());
  const [ready, setReady] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadState();
      setDb(normalizeImportedDB(loaded));
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (savingRef.current) return;

    savingRef.current = true;
    const t = setTimeout(async () => {
      await saveState(db);
      savingRef.current = false;
    }, 250);

    return () => clearTimeout(t);
  }, [db, ready]);

  const activeCase = useMemo(() => db.caseData, [db]);

  function updateCase(patch) {
    setDb((prev) => ({
      ...prev,
      caseData: {
        ...prev.caseData,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function openProVersion() {
    window.open(PRO_URL, "_blank", "noopener,noreferrer");
  }

  /** ===========================
   * UI tabs
   * =========================== */
  const [tab, setTab] = useState("timeline");
  const [search, setSearch] = useState("");

  /** ===========================
   * Modais
   * =========================== */
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);

  /** ===========================
   * Form Pessoa
   * =========================== */
  const [personDraft, setPersonDraft] = useState(null);

  function openNewPerson() {
    setPersonDraft({
      id: uid(),
      nome: "",
      telefone: "",
      cpf: "",
      endereco: "",
      papeis: [],
      depoimento: "",
      fotoDataUrl: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setShowPersonModal(true);
  }

  function openEditPerson(personId) {
    const p = activeCase.pessoas.find((x) => x.id === personId);
    if (!p) return;
    setPersonDraft({ ...p });
    setShowPersonModal(true);
  }

  async function onPickPersonPhoto(file) {
    if (!file) return;
    const compressed = await compressImage(file, 1000, 0.7);
    setPersonDraft((s) => ({ ...s, fotoDataUrl: compressed }));
  }

  function savePerson() {
    if (!personDraft?.nome?.trim()) return;

    const p = {
      ...personDraft,
      nome: personDraft.nome.trim(),
      updatedAt: new Date().toISOString(),
    };

    updateCase({
      pessoas: activeCase.pessoas.some((x) => x.id === p.id)
        ? activeCase.pessoas.map((x) => (x.id === p.id ? p : x))
        : [p, ...activeCase.pessoas],
    });

    setShowPersonModal(false);
  }

  function deletePerson(personId) {
    if (!window.confirm("Remover esta pessoa do caso?")) return;

    updateCase({
      pessoas: activeCase.pessoas.filter((p) => p.id !== personId),
      eventos: activeCase.eventos.map((e) => ({
        ...e,
        pessoasIds: (e.pessoasIds || []).filter((id) => id !== personId),
      })),
    });
  }

  /** ===========================
   * Form Evento
   * =========================== */
  const [eventDraft, setEventDraft] = useState(null);

  function openNewEvent() {
    const dt = nowLocalISOString();

    setEventDraft({
      id: uid(),
      titulo: "",
      local: "",
      descricao: "",
      dataHoraLocal: dt,
      dataHoraISO: dtLocalToISO(dt),
      pessoasIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setShowEventModal(true);
  }

  function openEditEvent(eventId) {
    const e = activeCase.eventos.find((x) => x.id === eventId);
    if (!e) return;

    setEventDraft({
      ...e,
      dataHoraLocal: e.dataHoraLocal || nowLocalISOString(),
    });

    setShowEventModal(true);
  }

  function saveEvent() {
    if (!eventDraft?.titulo?.trim()) return;

    const e = {
      ...eventDraft,
      titulo: eventDraft.titulo.trim(),
      dataHoraISO: dtLocalToISO(eventDraft.dataHoraLocal),
      updatedAt: new Date().toISOString(),
    };

    const eventos = activeCase.eventos.some((x) => x.id === e.id)
      ? activeCase.eventos.map((x) => (x.id === e.id ? e : x))
      : [e, ...activeCase.eventos];

    eventos.sort((a, b) => (a.dataHoraISO < b.dataHoraISO ? 1 : -1));

    updateCase({ eventos });
    setShowEventModal(false);
  }

  function deleteEvent(eventId) {
    if (!window.confirm("Remover este evento?")) return;

    updateCase({
      eventos: activeCase.eventos.filter((e) => e.id !== eventId),
    });
  }

  /** ===========================
   * Reset único caso
   * =========================== */
  function resetCase() {
    if (!window.confirm("Limpar todos os dados deste caso atual?")) return;
    setDb({
      version: 2,
      caseData: makeSingleCase(),
    });
    setTab("timeline");
    setSearch("");
  }

  /** ===========================
   * Importar / Exportar JSON
   * =========================== */
  function exportJSON() {
    const data = JSON.stringify(db, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diligencias_backup_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file) {
    if (!file) return;
    const text = await file.text();

    try {
      const obj = JSON.parse(text);
      const normalized = normalizeImportedDB(obj);
      setDb(normalized);
      alert("Importação concluída.");
    } catch (e) {
      alert("Falha ao importar: arquivo inválido.");
      console.error(e);
    }
  }

  /** ===========================
   * PDF (jsPDF)
   * =========================== */
  function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
    const lines = doc.splitTextToSize(text || "", maxWidth);
    lines.forEach((ln) => {
      doc.text(ln, x, y);
      y += lineHeight;
    });
    return y;
  }

  function gerarPDFDoCaso(caseObj) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    let y = 12;

    const ensureSpace = (needed = 12) => {
      if (y + needed > pageH - margin) {
        doc.addPage();
        y = 12;
      }
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("RELATÓRIO DE DILIGÊNCIAS", margin, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 6;

    const boxY = y;
    const boxH = 34;
    doc.setDrawColor(220);
    doc.roundedRect(margin, boxY, pageW - margin * 2, boxH, 2, 2);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.text("Dados do caso", margin + 3, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.text(`Título: ${caseObj.titulo || ""}`, margin + 3, y);
    y += 5;
    doc.text(`REDS: ${caseObj.reds || ""}`, margin + 3, y);
    y += 5;
    doc.text(`Local do fato: ${caseObj.localFato || ""}`, margin + 3, y);
    y += 5;
    doc.text(`Equipe: ${caseObj.equipe || ""}`, margin + 3, y);
    y += 5;
    doc.text(`Viatura: ${caseObj.viatura || ""}`, margin + 3, y);
    y = boxY + boxH + 8;

    if (caseObj.observacoes?.trim()) {
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.text("Observações:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      y = addWrappedText(
        doc,
        caseObj.observacoes,
        margin,
        y,
        pageW - margin * 2,
        5
      );
      y += 6;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Pessoas", margin, y);
    y += 6;

    doc.setFontSize(10);
    const pessoas = caseObj.pessoas || [];
    for (let i = 0; i < pessoas.length; i++) {
      const p = pessoas[i];

      ensureSpace(40);

      doc.setFont("helvetica", "bold");
      doc.text(
        `${String(i + 1).padStart(2, "0")} — ${p.nome || ""}`,
        margin,
        y
      );
      y += 5;

      doc.setFont("helvetica", "normal");
      const papeis = (p.papeis || []).join(", ");
      doc.text(`Papéis: ${papeis || "-"}`, margin, y);
      y += 5;

      doc.text(`Tel: ${p.telefone || "-"}   CPF: ${p.cpf || "-"}`, margin, y);
      y += 5;

      y = addWrappedText(
        doc,
        `Endereço: ${p.endereco || "-"}`,
        margin,
        y,
        pageW - margin * 2 - 34,
        5
      );

      if (p.fotoDataUrl) {
        try {
          const imgW = 28;
          const imgH = 28;
          const imgX = pageW - margin - imgW;
          const imgY = y - 20;
          doc.addImage(p.fotoDataUrl, "JPEG", imgX, imgY, imgW, imgH);
        } catch {}
      }

      if (p.depoimento?.trim()) {
        doc.setFont("helvetica", "bold");
        doc.text("Depoimento:", margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        y = addWrappedText(doc, p.depoimento, margin, y, pageW - margin * 2, 5);
      }

      y += 6;
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 6;
    }

    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Linha do tempo", margin, y);
    y += 6;

    doc.setFontSize(10);
    const eventos = [...(caseObj.eventos || [])].sort((a, b) =>
      a.dataHoraISO < b.dataHoraISO ? -1 : 1
    );

    for (let i = 0; i < eventos.length; i++) {
      const e = eventos[i];

      ensureSpace(30);

      doc.setFont("helvetica", "bold");
      doc.text(
        `${String(i + 1).padStart(2, "0")} — ${e.titulo || ""}`,
        margin,
        y
      );
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.text(`Data/Hora: ${fmtDateTime(e.dataHoraISO)}`, margin, y);
      y += 5;

      if (e.local?.trim()) {
        y = addWrappedText(
          doc,
          `Local: ${e.local}`,
          margin,
          y,
          pageW - margin * 2,
          5
        );
      }

      const nomesPessoas = (e.pessoasIds || [])
        .map((id) => pessoas.find((p) => p.id === id)?.nome)
        .filter(Boolean)
        .join("; ");

      if (nomesPessoas) {
        y = addWrappedText(
          doc,
          `Pessoas relacionadas: ${nomesPessoas}`,
          margin,
          y,
          pageW - margin * 2,
          5
        );
      }

      if (e.descricao?.trim()) {
        doc.setFont("helvetica", "bold");
        doc.text("Descrição:", margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        y = addWrappedText(doc, e.descricao, margin, y, pageW - margin * 2, 5);
      }

      y += 6;
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 6;
    }

    const safeReds = (caseObj.reds || "SEM_REDS").replace(/[^\w-]+/g, "_");
    const safeTitle = (caseObj.titulo || "Caso").replace(/[^\w-]+/g, "_");
    doc.save(`Relatorio_${safeReds}_${safeTitle}.pdf`);
  }

  /** ===========================
   * Busca / filtro
   * =========================== */
  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeCase.pessoas;

    return activeCase.pessoas.filter((p) => {
      return (
        (p.nome || "").toLowerCase().includes(q) ||
        (p.endereco || "").toLowerCase().includes(q) ||
        (p.telefone || "").toLowerCase().includes(q) ||
        (p.cpf || "").toLowerCase().includes(q) ||
        (p.depoimento || "").toLowerCase().includes(q) ||
        (p.papeis || []).join(" ").toLowerCase().includes(q)
      );
    });
  }, [activeCase.pessoas, search]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeCase.eventos;

    return activeCase.eventos.filter((e) => {
      const peopleNames = (e.pessoasIds || [])
        .map((id) => activeCase.pessoas.find((p) => p.id === id)?.nome || "")
        .join(" ");

      return (
        (e.titulo || "").toLowerCase().includes(q) ||
        (e.local || "").toLowerCase().includes(q) ||
        (e.descricao || "").toLowerCase().includes(q) ||
        peopleNames.toLowerCase().includes(q)
      );
    });
  }, [activeCase.eventos, activeCase.pessoas, search]);

  /** ===========================
   * Render
   * =========================== */
  return (
    <div className="container">
      <div className="topbar">
        <div>
          <div className="h1">Diligências — App</div>
          <div className="help">
            Offline no celular (salva no aparelho). Para levar pro PC use{" "}
            <span className="kbd">Exportar</span> e depois{" "}
            <span className="kbd">Importar</span>.
          </div>
        </div>

        <div className="pills">
          <span className="pill">REDS: {activeCase.reds || "—"}</span>
          <span className="pill">Local: {activeCase.localFato || "—"}</span>
          <span className="pill">Equipe: {activeCase.equipe || "—"}</span>
          <span className="pill">Viatura: {activeCase.viatura || "—"}</span>
        </div>

        <div className="btns">
          <button className="primary" onClick={() => gerarPDFDoCaso(activeCase)}>
            Gerar PDF
          </button>
          <button className="ghost" onClick={exportJSON}>
            Exportar
          </button>
          <label style={{ margin: 0 }}>
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => importJSON(e.target.files?.[0])}
            />
            <span
              className="tab"
              style={{ cursor: "pointer", display: "inline-block" }}
            >
              Importar
            </span>
          </label>
          <button className="ghost" onClick={openProVersion}>
            Mais recursos na versão Pro
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div style={{ flex: 2, minWidth: 260 }}>
            <label>Buscar (pessoa, local, descrição, depoimento, CPF…)</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Digite para filtrar…"
            />
          </div>

          <div className="btns" style={{ alignItems: "flex-end" }}>
            <button className="primary" onClick={openNewPerson}>
              + Pessoa
            </button>
            <button className="primary" onClick={openNewEvent}>
              + Evento
            </button>
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${tab === "timeline" ? "active" : ""}`}
            onClick={() => setTab("timeline")}
          >
            Linha do tempo
          </button>
          <button
            className={`tab ${tab === "pessoas" ? "active" : ""}`}
            onClick={() => setTab("pessoas")}
          >
            Pessoas
          </button>
          <button
            className={`tab ${tab === "caso" ? "active" : ""}`}
            onClick={() => setTab("caso")}
          >
            Caso
          </button>
          <button
            className={`tab ${tab === "export" ? "active" : ""}`}
            onClick={() => setTab("export")}
          >
            Backup
          </button>
        </div>

        {tab === "timeline" && (
          <div className="list">
            {filteredEvents.length === 0 ? (
              <div className="small">Nenhum evento encontrado.</div>
            ) : (
              filteredEvents.map((e) => {
                const nomes = (e.pessoasIds || [])
                  .map((id) => activeCase.pessoas.find((p) => p.id === id)?.nome)
                  .filter(Boolean);

                return (
                  <div className="item" key={e.id}>
                    <div className="itemHeader">
                      <div>
                        <div className="title">{e.titulo || "(sem título)"}</div>
                        <div className="sub">
                          {fmtDateTime(e.dataHoraISO)}{" "}
                          {e.local ? `• ${e.local}` : ""}
                        </div>
                      </div>

                      <div className="btns">
                        <span className="badge">{nomes.length} pessoa(s)</span>
                        <button
                          className="ghost"
                          onClick={() => openEditEvent(e.id)}
                        >
                          Editar
                        </button>
                        <button
                          className="danger"
                          onClick={() => deleteEvent(e.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    {nomes.length > 0 && (
                      <div className="small" style={{ marginTop: 8 }}>
                        Pessoas: {nomes.join("; ")}
                      </div>
                    )}

                    {e.descricao?.trim() && (
                      <div className="small" style={{ marginTop: 8 }}>
                        {e.descricao}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "pessoas" && (
          <div className="list">
            {filteredPeople.length === 0 ? (
              <div className="small">Nenhuma pessoa encontrada.</div>
            ) : (
              filteredPeople.map((p) => (
                <div className="item" key={p.id}>
                  <div className="personLine">
                    <img
                      className="avatar"
                      src={
                        p.fotoDataUrl ||
                        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiMyMjMiLz48dGV4dCB4PSI1MCIgeT0iNTUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiM4OGEiPkZPVE88L3RleHQ+PC9zdmc+"
                      }
                      alt="foto"
                    />

                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div className="itemHeader">
                        <div>
                          <div className="title">{p.nome || "(sem nome)"}</div>
                          <div className="sub">
                            Papéis: {(p.papeis || []).join(", ") || "—"}
                          </div>
                        </div>

                        <div className="btns">
                          <button
                            className="ghost"
                            onClick={() => openEditPerson(p.id)}
                          >
                            Editar
                          </button>
                          <button
                            className="danger"
                            onClick={() => deletePerson(p.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>

                      <div className="small" style={{ marginTop: 8 }}>
                        Tel: {p.telefone || "—"} • CPF: {p.cpf || "—"}
                      </div>

                      <div className="small">Endereço: {p.endereco || "—"}</div>

                      {p.depoimento?.trim() && (
                        <>
                          <div className="hr" />
                          <div className="small">{p.depoimento}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "caso" && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <div>
                <label>Título do caso</label>
                <input
                  value={activeCase.titulo}
                  onChange={(e) => updateCase({ titulo: e.target.value })}
                />
              </div>

              <div>
                <label>REDS</label>
                <input
                  value={activeCase.reds}
                  onChange={(e) => updateCase({ reds: e.target.value })}
                />
              </div>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <div>
                <label>Local do fato</label>
                <input
                  value={activeCase.localFato}
                  onChange={(e) => updateCase({ localFato: e.target.value })}
                />
              </div>

              <div>
                <label>Equipe</label>
                <input
                  value={activeCase.equipe}
                  onChange={(e) => updateCase({ equipe: e.target.value })}
                />
              </div>

              <div>
                <label>Viatura</label>
                <input
                  value={activeCase.viatura}
                  onChange={(e) => updateCase({ viatura: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label>Observações / Resumo</label>
              <textarea
                value={activeCase.observacoes}
                onChange={(e) => updateCase({ observacoes: e.target.value })}
                placeholder="Ex.: histórico, informação inicial, contexto…"
              />
            </div>

            <div className="btns" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={openProVersion}>
                Mais recursos na versão Pro
              </button>
              <button className="danger" onClick={resetCase}>
                Limpar caso atual
              </button>
            </div>

            <div className="hr" />
            <div className="help">
              <b>Dica:</b> se você cadastrar no celular e quiser abrir no PC:{" "}
              <span className="kbd">Exportar</span> → mandar o JSON
              (WhatsApp/Drive) → no PC <span className="kbd">Importar</span>.
            </div>
          </div>
        )}

        {tab === "export" && (
          <div style={{ marginTop: 12 }}>
            <div className="item">
              <div className="title">Backup / Transferência</div>
              <div className="small" style={{ marginTop: 6 }}>
                O app salva offline no aparelho. Para transferir entre celular e
                PC: exporte um JSON e importe no outro.
              </div>

              <div className="btns" style={{ marginTop: 10 }}>
                <button className="primary" onClick={exportJSON}>
                  Exportar JSON (backup)
                </button>

                <label>
                  <input
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={(e) => importJSON(e.target.files?.[0])}
                  />
                  <span
                    className="tab"
                    style={{ cursor: "pointer", display: "inline-block" }}
                  >
                    Importar JSON
                  </span>
                </label>

                <button className="ghost" onClick={openProVersion}>
                  Mais recursos na versão Pro
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =============== MODAL: PESSOA =============== */}
      {showPersonModal && personDraft && (
        <div className="modalBack" onClick={() => setShowPersonModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                {activeCase.pessoas.some((p) => p.id === personDraft.id)
                  ? "Editar Pessoa"
                  : "Cadastrar Pessoa"}
              </div>

              <button
                className="ghost"
                onClick={() => setShowPersonModal(false)}
              >
                Fechar
              </button>
            </div>

            <div className="modalBody">
              <div className="row">
                <div>
                  <label>Nome</label>
                  <input
                    value={personDraft.nome}
                    onChange={(e) =>
                      setPersonDraft((s) => ({ ...s, nome: e.target.value }))
                    }
                    placeholder="Nome completo"
                  />
                </div>

                <div>
                  <label>Telefone</label>
                  <input
                    value={personDraft.telefone}
                    onChange={(e) =>
                      setPersonDraft((s) => ({
                        ...s,
                        telefone: e.target.value,
                      }))
                    }
                    placeholder="(xx) xxxxx-xxxx"
                  />
                </div>

                <div>
                  <label>CPF</label>
                  <input
                    value={personDraft.cpf}
                    onChange={(e) =>
                      setPersonDraft((s) => ({ ...s, cpf: e.target.value }))
                    }
                    placeholder="Somente números"
                  />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Endereço</label>
                <input
                  value={personDraft.endereco}
                  onChange={(e) =>
                    setPersonDraft((s) => ({ ...s, endereco: e.target.value }))
                  }
                  placeholder="Rua, número, bairro, cidade"
                />
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <div>
                  <label>Papéis (pode marcar vários)</label>
                  <div className="pills">
                    {ROLES.map((r) => {
                      const on = (personDraft.papeis || []).includes(r);

                      return (
                        <button
                          key={r}
                          className={on ? "tab active" : "tab"}
                          type="button"
                          onClick={() => {
                            setPersonDraft((s) => {
                              const set = new Set(s.papeis || []);
                              if (set.has(r)) set.delete(r);
                              else set.add(r);
                              return { ...s, papeis: Array.from(set) };
                            });
                          }}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>

                  <div className="help" style={{ marginTop: 6 }}>
                    Ex.: mesma pessoa pode ser <b>vítima</b> e{" "}
                    <b>testemunha</b>.
                  </div>
                </div>

                <div>
                  <label>Foto (vai comprimir automático)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPickPersonPhoto(e.target.files?.[0])}
                  />

                  {personDraft.fotoDataUrl && (
                    <img
                      src={personDraft.fotoDataUrl}
                      alt="foto"
                      className="avatar"
                      style={{ marginTop: 10 }}
                    />
                  )}

                  <div className="help" style={{ marginTop: 6 }}>
                    Dica: foto grande vira menor (JPEG) para caber no offline.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Depoimento</label>
                <textarea
                  value={personDraft.depoimento}
                  onChange={(e) =>
                    setPersonDraft((s) => ({
                      ...s,
                      depoimento: e.target.value,
                    }))
                  }
                  placeholder="Relato / qualificações / observações…"
                />
              </div>
            </div>

            <div className="modalFooter">
              <button
                className="ghost"
                onClick={() => setShowPersonModal(false)}
              >
                Cancelar
              </button>

              <button
                className="primary"
                onClick={savePerson}
                disabled={!personDraft.nome.trim()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =============== MODAL: EVENTO =============== */}
      {showEventModal && eventDraft && (
        <div className="modalBack" onClick={() => setShowEventModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                {activeCase.eventos.some((x) => x.id === eventDraft.id)
                  ? "Editar Evento"
                  : "Adicionar Evento"}
              </div>

              <button
                className="ghost"
                onClick={() => setShowEventModal(false)}
              >
                Fechar
              </button>
            </div>

            <div className="modalBody">
              <div className="row">
                <div style={{ flex: 2, minWidth: 260 }}>
                  <label>Título</label>
                  <input
                    value={eventDraft.titulo}
                    onChange={(e) =>
                      setEventDraft((s) => ({ ...s, titulo: e.target.value }))
                    }
                    placeholder="Ex.: diligência em local / contato com testemunha…"
                  />
                </div>

                <div>
                  <label>Data/Hora (você escolhe)</label>
                  <input
                    type="datetime-local"
                    value={eventDraft.dataHoraLocal}
                    onChange={(e) =>
                      setEventDraft((s) => ({
                        ...s,
                        dataHoraLocal: e.target.value,
                      }))
                    }
                  />

                  <div className="help" style={{ marginTop: 6 }}>
                    Não depende do relógio do celular: você define a data/hora
                    do fato.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Local</label>
                <input
                  value={eventDraft.local}
                  onChange={(e) =>
                    setEventDraft((s) => ({ ...s, local: e.target.value }))
                  }
                  placeholder="Rua / bairro / ponto de referência…"
                />
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Pessoas relacionadas</label>
                <div className="pills">
                  {(activeCase.pessoas || []).map((p) => {
                    const on = (eventDraft.pessoasIds || []).includes(p.id);

                    return (
                      <button
                        key={p.id}
                        className={on ? "tab active" : "tab"}
                        type="button"
                        onClick={() => {
                          setEventDraft((s) => {
                            const set = new Set(s.pessoasIds || []);
                            if (set.has(p.id)) set.delete(p.id);
                            else set.add(p.id);
                            return { ...s, pessoasIds: Array.from(set) };
                          });
                        }}
                      >
                        {p.nome || "Sem nome"}
                      </button>
                    );
                  })}
                </div>

                {(activeCase.pessoas || []).length === 0 && (
                  <div className="help" style={{ marginTop: 6 }}>
                    Cadastre pessoas primeiro para relacionar ao evento.
                  </div>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Descrição</label>
                <textarea
                  value={eventDraft.descricao}
                  onChange={(e) =>
                    setEventDraft((s) => ({ ...s, descricao: e.target.value }))
                  }
                  placeholder="Detalhe da diligência, resultados, informações obtidas…"
                />
              </div>

              <div className="btns" style={{ marginTop: 12 }}>
                <button className="ghost" type="button" onClick={openProVersion}>
                  Mais recursos na versão Pro
                </button>
              </div>
            </div>

            <div className="modalFooter">
              <button
                className="ghost"
                onClick={() => setShowEventModal(false)}
              >
                Cancelar
              </button>

              <button
                className="primary"
                onClick={saveEvent}
                disabled={!eventDraft.titulo.trim()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
