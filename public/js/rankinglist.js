(function () {
    const DEFAULT_AVATAR =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
            "<rect width='64' height='64' fill='#242932'/>" +
            "<circle cx='32' cy='25' r='11' fill='#8a93a3'/>" +
            "<ellipse cx='32' cy='64' rx='22' ry='19' fill='#8a93a3'/></svg>"
        );
    const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };
    const TABS = [
        { key: "points", label: "POINTS", url: "/api/ranking/points" },
        { key: "endless", label: "ENDLESS", url: "/api/ranking/endless" },
    ];

    let overlay, tabsEl, descEl, bodyEl, footEl;
    let activeTab = "points";
    let requestId = 0; // กัน response เก่ามาทับตอนสลับแท็บเร็วๆ

    // ใช้ textContent ทั้งหมด กัน XSS จากชื่อผู้เล่น
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function avatar(url) {
        const img = el("img", "rk-avatar");
        img.alt = "";
        img.src = url || DEFAULT_AVATAR;
        img.onerror = () => {
            img.onerror = null;
            img.src = DEFAULT_AVATAR;
        };
        return img;
    }

    function rankBadge(rank) {
        const medal = MEDALS[rank];
        return el("span", "rk-rank" + (medal ? " top" : ""), medal || `#${rank}`);
    }

    function formatDuration(totalSeconds) {
        const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const pad = (n) => String(n).padStart(2, "0");
        return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
    }

    function formatDate(iso) {
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
    }

    function renderPoints(data) {
        bodyEl.innerHTML = "";
        footEl.innerHTML = "";
        const list = data.list || [];
        if (!list.length) {
            bodyEl.appendChild(el("div", "rk-state", "ยังไม่มีข้อมูลอันดับ"));
            return;
        }
        list.forEach((r) => {
            const row = el("div", "rk-row" + (r.is_me ? " me" : ""));
            row.appendChild(rankBadge(r.rank));
            row.appendChild(avatar(r.profile_image));
            row.appendChild(el("span", "rk-name", r.username + (r.is_me ? " (คุณ)" : "")));
            row.appendChild(el("span", "rk-score", `${Number(r.points).toLocaleString("en-US")} pts`));
            bodyEl.appendChild(row);
        });

        if (data.me && !data.me.in_list) {
            footEl.appendChild(
                el("div", "rk-me-bar", `คุณอยู่อันดับ #${data.me.rank} · ${Number(data.me.points).toLocaleString("en-US")} points`)
            );
        }
    }

    function renderEndless(data) {
        bodyEl.innerHTML = "";
        footEl.innerHTML = "";
        const list = data.list || [];
        if (!list.length) {
            bodyEl.appendChild(el("div", "rk-state", "ยังไม่มีสถิติ Endless — ลองเล่นโหมด Endless ดูสิ"));
            return;
        }
        list.forEach((r) => {
            const card = el("div", "rk-run" + (r.includes_me ? " me" : ""));

            const head = el("div", "rk-run-head");
            head.appendChild(rankBadge(r.rank));
            head.appendChild(el("span", "rk-time", formatDuration(r.duration_time)));
            head.appendChild(el("span", "rk-days", `รอดมา ${r.days_survived || 0} วัน`));
            head.appendChild(el("span", "rk-date", formatDate(r.played_at)));
            card.appendChild(head);

            const players = el("div", "rk-players");
            if (r.players && r.players.length) {
                r.players.forEach((p) => {
                    const chip = el("span", "rk-chip" + (p.is_me ? " me" : ""));
                    chip.appendChild(avatar(p.profile_image));
                    chip.appendChild(el("span", "", p.username));
                    players.appendChild(chip);
                });
            } else {
                players.appendChild(el("span", "rk-chip", "ไม่มีข้อมูลผู้เล่น"));
            }
            card.appendChild(players);

            bodyEl.appendChild(card);
        });
    }

    async function load() {
        const tab = TABS.find((t) => t.key === activeTab);
        const myRequest = ++requestId;
        descEl.textContent = tab.desc;
        bodyEl.innerHTML = "";
        footEl.innerHTML = "";
        bodyEl.appendChild(el("div", "rk-state", "กำลังโหลด..."));

        try {
            const res = await fetch(tab.url);
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const data = await res.json();
            if (myRequest !== requestId) return; // มีคำขอใหม่กว่าแล้ว
            if (tab.key === "points") renderPoints(data);
            else renderEndless(data);
        } catch (err) {
            if (myRequest !== requestId) return;
            console.error("Load ranking error:", err);
            bodyEl.innerHTML = "";
            bodyEl.appendChild(el("div", "rk-state error", "โหลดอันดับไม่สำเร็จ ลองใหม่อีกครั้ง"));
        }
    }

    function renderTabs() {
        tabsEl.innerHTML = "";
        TABS.forEach((t) => {
            const btn = el("button", "rk-tab" + (t.key === activeTab ? " active" : ""), t.label);
            btn.type = "button";
            btn.addEventListener("click", () => {
                if (activeTab === t.key) return;
                activeTab = t.key;
                renderTabs();
                load();
            });
            tabsEl.appendChild(btn);
        });
    }

    function build() {
        overlay = el("div", "rk-overlay");
        const modal = el("div", "rk-modal");
        const head = el("div", "rk-head");
        head.appendChild(el("h2", "", "RANKING"));
        const close = el("button", "rk-close", "✕");
        close.type = "button";
        close.title = "Close";
        close.addEventListener("click", closeModal);
        head.appendChild(close);

        tabsEl = el("div", "rk-tabs");
        descEl = el("div", "rk-desc");
        bodyEl = el("div", "rk-body");
        footEl = el("div", "rk-foot");

        modal.append(head, tabsEl, descEl, bodyEl, footEl);
        overlay.appendChild(modal);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
        });
        document.body.appendChild(overlay);
        renderTabs();
    }

    function openModal() {
        if (!overlay) build();
        overlay.classList.add("open");
        load(); // โหลดใหม่ทุกครั้งที่เปิด เพราะอันดับเปลี่ยนตลอด
    }

    function closeModal() {
        overlay?.classList.remove("open");
    }

    document.addEventListener("click", (e) => {
        if (e.target.closest("[data-open-ranking]")) openModal();
    });

    window.RankingList = { open: openModal, close: closeModal, reload: load };
})();