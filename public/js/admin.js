// ===== เรียก Express API (/api/admin/*) โดยใช้ cookie "token" ที่ login ไว้แล้ว =====
async function api(method, path, body) {
    const res = await fetch('/api/admin' + path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) location.href = '/login';
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json;
}

const $ = (id) => document.getElementById(id);

// ช่องข้อความในฟอร์ม (id ใน HTML คือ q_<ชื่อ> และ l_<ชื่อ>)
const QUEST_TEXT = ['title', 'description', 'input_run', 'input_submit', 'expected_output',
    'show_expect_output'];
const LANG_TEXT = ['name', 'image', 'file_name', 'compile_cmd', 'run_cmd'];

// ค่าตั้งต้นสำเร็จรูป เลือกแล้วกรอกฟอร์มให้
const LANG_PRESETS = [
    { name: 'Python', judge0_id: 71, image: 'python:3.12-slim', file_name: 'main.py', compile_cmd: '', run_cmd: 'python3 main.py' },
    { name: 'JavaScript', judge0_id: 63, image: 'node:22-slim', file_name: 'main.js', compile_cmd: '', run_cmd: 'node main.js' },
    { name: 'Java', judge0_id: 62, image: 'eclipse-temurin:21', file_name: 'Main.java', compile_cmd: 'javac -J-Xmx200m Main.java', run_cmd: 'java -Xmx128m Main' },
    { name: 'C++', judge0_id: 54, image: 'gcc:13', file_name: 'main.cpp', compile_cmd: 'g++ -O2 -o main main.cpp', run_cmd: './main' },
    { name: 'C', judge0_id: 50, image: 'gcc:13', file_name: 'main.c', compile_cmd: 'gcc -O2 -o main main.c', run_cmd: './main' },
    { name: 'Ruby', judge0_id: 72, image: 'ruby:3.3-slim', file_name: 'main.rb', compile_cmd: '', run_cmd: 'ruby main.rb' },
    { name: 'PHP', judge0_id: 68, image: 'php:8.3-cli', file_name: 'main.php', compile_cmd: '', run_cmd: 'php main.php' },
];

// ข้อความสถานะการติดตั้งภาษาบน judge
const STATUS_TEXT = {
    ready: 'พร้อมใช้งาน',
    pulling: 'กำลังติดตั้ง…',
    error: 'ติดตั้งไม่สำเร็จ',
    missing: 'ไม่มีบน judge',
    offline: 'judge ออฟไลน์',
};

// ข้อความระดับความยาก (ใน DB เก็บเป็น easy / medium / hard)
const LEVEL_TEXT = { easy: 'ง่าย', medium: 'ปานกลาง', hard: 'ยาก' };

let quests = [], langs = [], editingQuest = null, editingLang = null, langPoll = null;

// ===== ตรวจสิทธิ์: ต้อง login และ role = admin =====
async function init() {
    try {
        await api('GET', '/me');
    } catch (e) {
        $('gate').textContent = 'คุณไม่มีสิทธิ์เข้าหน้านี้';
        return;
    }
    $('gate').hidden = true;
    $('app').hidden = false;
    await Promise.all([loadQuests(), loadLangs()]);
}

// ===== Tabs =====
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    $('tab-quests').hidden = b.dataset.tab !== 'quests';
    $('tab-languages').hidden = b.dataset.tab !== 'languages';
}));

// ===== helpers =====
// สร้างช่อง <td> ใส่ข้อความ แล้วต่อท้ายแถว
function cell(tr, text, cls) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text ?? '';
    tr.appendChild(td);
    return td;
}

// สร้างปุ่ม
function button(text, cls, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.className = cls;
    b.onclick = onClick;
    return b;
}

// ===== Quests =====
async function loadQuests() {
    try { quests = await api('GET', '/quests'); } catch (e) { return alert(e.message); }
    const body = $('questRows');
    body.innerHTML = '';
    if (!quests.length) {
        body.innerHTML = '<tr><td colspan="5" class="empty">ยังไม่มีโจทย์ กด "เพิ่มโจทย์" เพื่อเริ่ม</td></tr>';
        return;
    }

    quests.forEach((q) => {
        const tr = document.createElement('tr');
        cell(tr, q.title);

        const badge = document.createElement('span');
        badge.className = 'badge ' + q.level;
        badge.textContent = LEVEL_TEXT[q.level];
        cell(tr, '').appendChild(badge);

        cell(tr, q.rewards);
        cell(tr, q.is_active ? 'เปิด' : 'ปิด');
        cell(tr, '', 'act').append(
            button('แก้ไข', 'ghost small', () => openQuest(q)),
            button('ลบ', 'danger small', () => deleteQuest(q)),
        );
        body.appendChild(tr);
    });
}

// สร้างช่องโค้ดตั้งต้น 1 ช่องต่อ 1 ภาษา (ตามรายการในแท็บ Languages)
function renderSetupCodeFields(setupCode) {
    const box = $('q_setup_codes');
    box.innerHTML = '';
    if (!langs.length) {
        box.innerHTML = '<p class="hint">ยังไม่มีภาษา เพิ่มภาษาในแท็บ "ภาษา" ก่อน</p>';
        return;
    }

    langs.forEach((l) => {
        const label = document.createElement('label');
        label.append(l.name);

        const idTag = document.createElement('span');
        idTag.className = 'lang-id';
        idTag.textContent = '#' + l.judge0_id;

        const ta = document.createElement('textarea');
        ta.className = 'code';
        ta.rows = 4;
        ta.dataset.langId = l.judge0_id;
        ta.value = setupCode[l.judge0_id] ?? '';

        label.append(idTag, ta);
        box.appendChild(label);
    });
}

function openQuest(q) {
    editingQuest = q || null;
    $('questDlgTitle').textContent = q ? 'แก้ไขโจทย์' : 'เพิ่มโจทย์';
    QUEST_TEXT.forEach((k) => { $('q_' + k).value = q?.[k] ?? ''; });
    $('q_level').value = q?.level ?? 'easy';
    $('q_rewards').value = q?.rewards ?? 0;
    $('q_is_active').checked = q?.is_active ?? true;
    renderSetupCodeFields(q?.setup_code || {});
    $('questErr').textContent = '';
    $('questDlg').showModal();
}

async function saveQuest() {
    const row = {
        level: $('q_level').value,
        rewards: parseInt($('q_rewards').value, 10) || 0,
        is_active: $('q_is_active').checked,
        setup_code: {},
    };
    QUEST_TEXT.forEach((k) => { row[k] = $('q_' + k).value; });

    // อ่านช่องโค้ดตั้งต้นกลับเป็น { "71": "...", "62": "..." } (ช่องที่ว่างไม่เก็บ)
    $('q_setup_codes').querySelectorAll('textarea').forEach((ta) => {
        if (ta.value.trim()) row.setup_code[ta.dataset.langId] = ta.value;
    });

    try {
        if (editingQuest) await api('PUT', '/quests/' + editingQuest.id, row);
        else await api('POST', '/quests', row);
    } catch (e) {
        return ($('questErr').textContent = e.message);
    }
    $('questDlg').close();
    loadQuests();
}

async function deleteQuest(q) {
    if (!confirm(`ลบโจทย์ "${q.title}" ใช่ไหม? ลบแล้วกู้คืนไม่ได้`)) return;
    try { await api('DELETE', '/quests/' + q.id); } catch (e) { return alert(e.message); }
    loadQuests();
}

// ===== Languages =====
async function loadLangs() {
    clearTimeout(langPoll);
    try { langs = await api('GET', '/languages'); } catch (e) { return alert(e.message); }
    const body = $('langRows');
    body.innerHTML = '';
    if (!langs.length) {
        body.innerHTML = '<tr><td colspan="5" class="empty">ยังไม่มีภาษา กด "เพิ่มภาษา" เพื่อเพิ่มภาษา</td></tr>';
        return;
    }

    langs.forEach((l) => {
        const tr = document.createElement('tr');
        cell(tr, l.name);
        cell(tr, l.judge0_id);
        cell(tr, l.image, 'mono');

        // สถานะการติดตั้งบน judge (+ ข้อความ error ถ้ามี)
        const st = cell(tr, '');
        const pill = document.createElement('span');
        pill.className = 'status ' + l.judge_status;
        pill.textContent = STATUS_TEXT[l.judge_status];
        st.appendChild(pill);
        if (l.judge_error) {
            const d = document.createElement('div');
            d.className = 'err-detail';
            d.textContent = l.judge_error;
            st.appendChild(d);
        }

        // ปุ่ม (Retry แสดงเฉพาะตอนติดตั้งไม่สำเร็จ)
        const act = cell(tr, '', 'act');
        if (l.judge_status === 'error' || l.judge_status === 'missing') {
            act.appendChild(button('ลองใหม่', 'ghost small', () => retryLang(l)));
        }
        act.append(
            button('แก้ไข', 'ghost small', () => openLang(l)),
            button('ลบ', 'danger small', () => deleteLang(l)),
        );
        body.appendChild(tr);
    });

    // ยังมีภาษาที่กำลังติดตั้ง -> โหลดสถานะใหม่ทุก 5 วินาที
    if (langs.some((l) => l.judge_status === 'pulling')) {
        langPoll = setTimeout(loadLangs, 5000);
    }
}

// กรอกฟอร์มภาษาจากข้อมูล (ใช้ตอนแก้ไข และตอนเลือก preset)
function fillLangForm(src) {
    $('l_judge0_id').value = src?.judge0_id ?? '';
    LANG_TEXT.forEach((k) => { $('l_' + k).value = src?.[k] ?? ''; });
}

function openLang(l) {
    editingLang = l || null;
    $('langDlgTitle').textContent = l ? 'แก้ไขภาษา' : 'เพิ่มภาษา';
    $('l_preset').value = '';
    $('l_preset').disabled = !!l;
    fillLangForm(l);
    $('langErr').textContent = '';
    $('langDlg').showModal();
}

async function saveLang() {
    const row = { judge0_id: parseInt($('l_judge0_id').value, 10) };
    LANG_TEXT.forEach((k) => { row[k] = $('l_' + k).value.trim(); });

    // กันกด Save ซ้ำระหว่างรอ judge
    const btn = $('langSave');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
        if (editingLang) await api('PUT', '/languages/' + editingLang.id, row);
        else await api('POST', '/languages', row);
    } catch (e) {
        return ($('langErr').textContent = e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึกภาษา';
    }

    $('langDlg').close();
    loadLangs();
}

// ส่งข้อมูลเดิมให้ judge ติดตั้งใหม่ (server เลือกเฉพาะช่องที่ใช้เอง)
async function retryLang(l) {
    try { await api('PUT', '/languages/' + l.id, l); } catch (e) { return alert(e.message); }
    loadLangs();
}

async function deleteLang(l) {
    if (!confirm(`ลบภาษา "${l.name}" ใช่ไหม? Docker image ของภาษานี้จะถูกลบออกจากเครื่อง judge ด้วย`)) return;
    try { await api('DELETE', '/languages/' + l.id); } catch (e) { return alert(e.message); }
    loadLangs();
}

// ===== presets =====
LANG_PRESETS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name;
    $('l_preset').appendChild(opt);
});
$('l_preset').onchange = (e) => {
    if (e.target.value !== '') fillLangForm(LANG_PRESETS[e.target.value]);
};

// ===== wiring =====
$('newQuest').onclick = () => openQuest();
$('questSave').onclick = saveQuest;
$('questCancel').onclick = () => $('questDlg').close();
$('newLang').onclick = () => openLang();
$('langSave').onclick = saveLang;
$('langCancel').onclick = () => $('langDlg').close();

init();
