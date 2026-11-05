/* ===== Quest list =====
   วิธีใช้ใน Main menu:
     <link rel="stylesheet" href="/css/questList.css">
     <button class="ql-open-btn" data-open-quests>ภารกิจ (Quests)</button>
     <script src="/js/questList.js"></script>
   ปุ่มใดก็ได้ที่มี attribute data-open-quests จะเปิดหน้าต่างรายการเควส
   หรือเรียก QuestList.open() จากโค้ดอื่นก็ได้ */

(function () {
    const LEVEL_ORDER = { easy: 0, medium: 1, hard: 2 };
    const FILTERS = [
        { key: "all", label: "ทั้งหมด" },
        { key: "easy", label: "Easy" },
        { key: "medium", label: "Medium" },
        { key: "hard", label: "Hard" },
    ];

    const RESULT_LABELS = {
        passed: "✔ ผ่านแล้ว",
        failed: "✖ ยังไม่ผ่าน",
        gave_up: "🏳 ยอมแพ้",
    };

    let quests = [];
    let languages = []; // [{ judge0_id, name }]
    let loaded = false;
    let activeFilter = "all";
    let overlay, listEl, filterEl;

    // ---------- helpers (ใช้ textContent ทั้งหมด กัน XSS จากข้อมูลในดาต้าเบส) ----------
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function formatRewards(rewards) {
        if (rewards === null || rewards === undefined || rewards === "") return [];
        if (Array.isArray(rewards)) return rewards.map(String);
        if (typeof rewards === "object") {
            return Object.entries(rewards).map(([k, v]) => `${k.toUpperCase()}: ${v}`);
        }
        return [`🎯 ${rewards}`];
    }

    function languageName(id) {
        const found = languages.find((l) => String(l.judge0_id) === String(id));
        return found ? found.name : `Language ${id}`;
    }

    // ---------- การ์ดเควส ----------
    function buildSetupCode(setupCode) {
        const keys = setupCode && typeof setupCode === "object" ? Object.keys(setupCode) : [];
        if (!keys.length) return null;

        const section = el("div", "ql-section");
        section.appendChild(el("span", "ql-label", "Setup code"));

        const code = el("pre", "ql-code", setupCode[keys[0]] || "");
        if (keys.length > 1) {
            const select = el("select", "ql-lang");
            keys.forEach((k) => {
                const opt = el("option", "", languageName(k));
                opt.value = k;
                select.appendChild(opt);
            });
            select.addEventListener("change", () => {
                code.textContent = setupCode[select.value] || "";
            });
            section.appendChild(select);
        }
        section.appendChild(code);
        return section;
    }

    function buildCard(q) {
        const level = String(q.level || "").toLowerCase();
        const card = el("article", "ql-card" + (q.is_active === false ? " inactive" : ""));

        const top = el("div", "ql-card-top");
        top.appendChild(el("h3", "ql-title", q.title || "(ไม่มีชื่อ)"));
        const badges = el("div", "ql-badges");
        badges.appendChild(el("span", `ql-badge lvl-${LEVEL_ORDER[level] !== undefined ? level : "other"}`, q.level || "-"));
        badges.appendChild(
            el("span", "ql-badge " + (q.is_active === false ? "off" : "on"), q.is_active === false ? "Inactive" : "Active")
        );
        top.appendChild(badges);
        card.appendChild(top);

        if (q.result) {
            const meta = el("div", "ql-result " + q.result);
            meta.appendChild(el("span", "ql-result-label", RESULT_LABELS[q.result] || q.result));
            if (q.times > 1) meta.appendChild(el("span", "ql-result-times", `ทำมาแล้ว ${q.times} ครั้ง`));
            card.appendChild(meta);
        }

        card.appendChild(el("p", "ql-desc", q.description || ""));

        const rewards = formatRewards(q.rewards);
        if (rewards.length) {
            const row = el("div", "ql-rewards");
            rewards.forEach((r) => row.appendChild(el("span", "ql-chip", r)));
            card.appendChild(row);
        }

        const details = el("details", "ql-details");
        details.appendChild(el("summary", "", "รายละเอียดโจทย์"));

        if (q.input_run) {
            const s = el("div", "ql-section");
            s.appendChild(el("span", "ql-label", "Input"));
            s.appendChild(el("pre", "ql-code", q.input_run));
            details.appendChild(s);
        }
        if (q.show_expect_output) {
            const s = el("div", "ql-section");
            s.appendChild(el("span", "ql-label", "Expected output"));
            s.appendChild(el("pre", "ql-code", q.show_expect_output));
            details.appendChild(s);
        }
        const setup = buildSetupCode(q.setup_code);
        if (setup) details.appendChild(setup);

        card.appendChild(details);
        return card;
    }

    // ---------- render ----------
    function renderList() {
        listEl.innerHTML = "";
        const shown = quests
            .filter((q) => activeFilter === "all" || String(q.level).toLowerCase() === activeFilter)
            .sort((a, b) => {
                const la = LEVEL_ORDER[String(a.level).toLowerCase()] ?? 99;
                const lb = LEVEL_ORDER[String(b.level).toLowerCase()] ?? 99;
                return la - lb || String(a.title).localeCompare(String(b.title));
            });

        if (!shown.length) {
            listEl.appendChild(
                el("div", "ql-state", quests.length ? "ไม่พบเควสในระดับนี้" : "ยังไม่มีประวัติ — เล่นเกมแล้วโจทย์ที่ทำจะมาแสดงที่นี่")
            );
            return;
        }
        shown.forEach((q) => listEl.appendChild(buildCard(q)));
    }

    function renderFilters() {
        filterEl.innerHTML = "";
        FILTERS.forEach((f) => {
            const btn = el("button", "ql-filter" + (f.key === activeFilter ? " active" : ""), f.label);
            btn.type = "button";
            btn.addEventListener("click", () => {
                activeFilter = f.key;
                renderFilters();
                renderList();
            });
            filterEl.appendChild(btn);
        });
    }

    async function load() {
        listEl.innerHTML = "";
        listEl.appendChild(el("div", "ql-state", "กำลังโหลดเควส..."));
        try {
            const [qRes, lRes] = await Promise.all([
                fetch("/api/quests"),
                fetch("/api/game/languages").catch(() => null), // ใช้แสดงชื่อภาษา ถ้าโหลดไม่ได้ก็ข้ามได้
            ]);
            if (!qRes.ok) throw new Error(`Server error: ${qRes.status}`);
            quests = await qRes.json();

            if (lRes && lRes.ok) {
                const body = await lRes.json();
                languages = Array.isArray(body) ? body : body.data || [];
            }
            loaded = true;
            renderList();
        } catch (err) {
            console.error("Load quests error:", err);
            listEl.innerHTML = "";
            listEl.appendChild(el("div", "ql-state error", "โหลดรายการเควสไม่สำเร็จ ลองใหม่อีกครั้ง"));
        }
    }

    // modal 
    function build() {
        overlay = el("div", "ql-overlay");
        const modal = el("div", "ql-modal");

        const head = el("div", "ql-head");
        head.appendChild(el("h2", "", "QUESTS"));
        const close = el("button", "ql-close", "✕");
        close.type = "button";
        close.title = "Close";
        close.addEventListener("click", closeModal);
        head.appendChild(close);

        filterEl = el("div", "ql-filters");
        listEl = el("div", "ql-list");

        modal.append(head, filterEl, listEl);
        overlay.appendChild(modal);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
        });
        document.body.appendChild(overlay);
        renderFilters();
    }

    function openModal() {
        if (!overlay) build();
        overlay.classList.add("open");
        if (!loaded) load();
    }

    function closeModal() {
        overlay?.classList.remove("open");
    }

    document.addEventListener("click", (e) => {
        if (e.target.closest("[data-open-quests]")) openModal();
    });

    window.QuestList = { open: openModal, close: closeModal, reload: load };
})();