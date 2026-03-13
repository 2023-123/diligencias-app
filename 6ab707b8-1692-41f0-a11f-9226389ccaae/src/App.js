import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { loadState, saveState } from "./storage";

/* ===========================
HELPERS
=========================== */

const PRO_URL =
  "https://play.google.com/store/apps/details?id=com.seupacote.pro";

const uid = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function nowLocalISOString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(
    d.getMonth() + 1
  )}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

/* ===========================
DATABASE
=========================== */

function emptyDB() {
  return {
    version: 1,
    caseData: {
      titulo: "Novo Caso",
      reds: "",
      localFato: "",
      equipe: "",
      viatura: "",
      observacoes: "",
      pessoas: [],
      eventos: [],
    },
  };
}

/* ===========================
APP
=========================== */

export default function App() {

  const [db, setDb] = useState(emptyDB());
  const [ready, setReady] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadState();
      if (loaded) setDb(loaded);
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

  const activeCase = db.caseData;

  function updateCase(patch) {
    setDb((prev) => ({
      ...prev,
      caseData: { ...prev.caseData, ...patch },
    }));
  }

  function openProVersion() {
    window.open(PRO_URL, "_blank");
  }

  /* ===========================
PESSOAS
=========================== */

  const [personDraft, setPersonDraft] = useState(null);
  const [showPersonModal, setShowPersonModal] = useState(false);

  function openNewPerson() {
    setPersonDraft({
      id: uid(),
      nome: "",
      telefone: "",
      cpf: "",
      endereco: "",
    });
    setShowPersonModal(true);
  }

  function savePerson() {
    updateCase({
      pessoas: [personDraft, ...activeCase.pessoas],
    });

    setShowPersonModal(false);
  }

  function deletePerson(id) {
    updateCase({
      pessoas: activeCase.pessoas.filter((p) => p.id !== id),
    });
  }

  /* ===========================
EVENTOS
=========================== */

  const [eventDraft, setEventDraft] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);

  function openNewEvent() {
    setEventDraft({
      id: uid(),
      titulo: "",
      descricao: "",
      dataHoraISO: new Date().toISOString(),
    });
    setShowEventModal(true);
  }

  function saveEvent() {
    updateCase({
      eventos: [eventDraft, ...activeCase.eventos],
    });

    setShowEventModal(false);
  }

  function deleteEvent(id) {
    updateCase({
      eventos: activeCase.eventos.filter((e) => e.id !== id),
    });
  }

  /* ===========================
PDF
=========================== */

  function gerarPDFDoCaso(caseObj) {

    const doc = new jsPDF();

    let y = 10;

    doc.text("RELATÓRIO DE DILIGÊNCIAS", 10, y);
    y += 10;

    doc.text(`Caso: ${caseObj.titulo}`, 10, y);
    y += 6;

    doc.text(`REDS: ${caseObj.reds}`, 10, y);
    y += 6;

    doc.text(`Local: ${caseObj.localFato}`, 10, y);
    y += 6;

    doc.text(`Equipe: ${caseObj.equipe}`, 10, y);
    y += 6;

    doc.text(`Viatura: ${caseObj.viatura}`, 10, y);
    y += 10;

    doc.text("EVENTOS", 10, y);
    y += 8;

    caseObj.eventos.forEach((e, i) => {

      doc.text(
        `${i + 1} - ${e.titulo}`,
        10,
        y
      );
      y += 5;

      doc.text(
        fmtDateTime(e.dataHoraISO),
        10,
        y
      );
      y += 5;

      doc.text(
        e.descricao || "",
        10,
        y
      );
      y += 8;
    });

    doc.save("relatorio_diligencia.pdf");
  }

  /* ===========================
RENDER
=========================== */

  return (
    <div className="container">

      <div className="topbar">

        <div className="h1">
          Diligências App
        </div>

        <div className="pills">
          <span className="pill">
            REDS: {activeCase.reds || "—"}
          </span>

          <span className="pill">
            Local: {activeCase.localFato || "—"}
          </span>

          <span className="pill">
            Equipe: {activeCase.equipe || "—"}
          </span>

          <span className="pill">
            Viatura: {activeCase.viatura || "—"}
          </span>
        </div>

        <div className="btns">

          <button
            className="primary"
            onClick={() => gerarPDFDoCaso(activeCase)}
          >
            Gerar PDF
          </button>

          <button
            className="primary"
            onClick={openNewPerson}
          >
            + Pessoa
          </button>

          <button
            className="primary"
            onClick={openNewEvent}
          >
            + Evento
          </button>

        </div>

        {/* CARD PRO */}

        <div className="proCard">

          <div className="proTitle">
            🚀 Versão Pro
          </div>

          <div className="proFeatures">
            <div>📡 Funciona totalmente offline</div>
            <div>📂 Múltiplos casos</div>
            <div>📍 Coordenadas GPS no relatório</div>
            <div>🖼️ Imagens nos eventos</div>
          </div>

          <button
            className="proBtn"
            onClick={openProVersion}
          >
            ✨ Mais recursos na versão Pro
          </button>

        </div>

      </div>

      {/* EVENTOS */}

      <div className="card">

        <h3>Linha do tempo</h3>

        {activeCase.eventos.map((e) => (
          <div className="item" key={e.id}>

            <div className="title">
              {e.titulo}
            </div>

            <div className="sub">
              {fmtDateTime(e.dataHoraISO)}
            </div>

            <div className="small">
              {e.descricao}
            </div>

            <button
              className="danger"
              onClick={() => deleteEvent(e.id)}
            >
              Remover
            </button>

          </div>
        ))}

      </div>

    </div>
  );
}
