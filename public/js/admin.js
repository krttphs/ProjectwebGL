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
const QUEST_TEXT = ['title', 'description', 'input_run', 'input_submit', 'expected_output',
    'show_expect_output', 'setup_code_python', 'setup_code_js', 'setup_code_java'];
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

let quests = [], langs = [], editingQuest = null, editingLang = null, langPoll = null;

// ===== ตรวจสิทธิ์: ต้อง login และ role = admin =====
async function init() {
    try { await api('GET', '/me'); }
    catch (e) {
        $('gate').textContent = 'You do not have permission to view this page.';
        return;
    }
    $('gate').hidden = true;
    $('app').hidden = false;
    await Promise.all([loadQuests(), loadLangs()]);
}

// ===== Tabs =====
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    ['quests', 'languages'].forEach((n) => ($('tab-' + n).hidden = n !== b.dataset.tab));
}));

// ===== helpers =====
function cell(tr, text, cls) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text ?? '';
    tr.appendChild(td);
    return td;
}
function button(text, cls, onClick) {
    const b = Object.assign(document.createElement('button'), { textContent: text, className: cls });
    b.onclick = onClick;
    return b;
}
function actions(tr, onEdit, onDelete, extra = []) {
    const td = cell(tr, '', 'act');
    td.append(...extra, button('Edit', 'ghost small', onEdit), button('Delete', 'danger small', onDelete));
}
function emptyRow(tbody, cols, text) {
    const tr = document.createElement('tr');
    const td = cell(tr, text, 'empty');
    td.colSpan = cols;
    tbody.appendChild(tr);
}

// ===== Quests =====
async function loadQuests() {
    try { quests = await api('GET', '/quests'); } catch (e) { return alert(e.message); }
    const body = $('questRows');
    body.innerHTML = '';
    if (!quests.length) return emptyRow(body, 5, 'No quests yet. Add the first one.');
    quests.forEach((q) => {
        const tr = document.createElement('tr');
        cell(tr, q.title);
        const lv = cell(tr, '');
        lv.innerHTML = '<span class="badge"></span>';
        lv.firstChild.textContent = q.level;
        lv.firstChild.classList.add(q.level);
        cell(tr, q.rewards);
        cell(tr, q.is_active ? 'Yes' : 'No');
        actions(tr, () => openQuest(q), () => deleteQuest(q));
        body.appendChild(tr);
    });
}

function openQuest(q) {
    editingQuest = q || null;
    $('questDlgTitle').textContent = q ? 'Edit quest' : 'Add quest';
    QUEST_TEXT.forEach((k) => ($('q_' + k).value = q?.[k] ?? ''));
    $('q_level').value = q?.level ?? 'easy';
    $('q_rewards').value = q?.rewards ?? 0;
    $('q_is_active').checked = q?.is_active ?? true;
    $('questErr').textContent = '';
    $('questDlg').showModal();
}

async function saveQuest() {
    const row = { level: $('q_level').value, rewards: parseInt($('q_rewards').value, 10) || 0, is_active: $('q_is_active').checked };
    QUEST_TEXT.forEach((k) => (row[k] = $('q_' + k).value));
    if (!row.title.trim()) return ($('questErr').textContent = 'Title is required.');
    try { await (editingQuest ? api('PUT', '/quests/' + editingQuest.id, row) : api('POST', '/quests', row)); }
    catch (e) { return ($('questErr').textContent = e.message); }
    $('questDlg').close();
    loadQuests();
}

async function deleteQuest(q) {
    if (!confirm(`Delete quest "${q.title}"? This cannot be undone.`)) return;
    try { await api('DELETE', '/quests/' + q.id); } catch (e) { return alert(e.message); }
    loadQuests();
}

// ===== Languages =====
const STATUS_TEXT = {
    ready: 'Ready',
    pulling: 'Installing…',
    error: 'Install failed',
    missing: 'Not on judge',
    offline: 'Judge offline',
};

async function loadLangs() {
    clearTimeout(langPoll);
    try { langs = await api('GET', '/languages'); } catch (e) { return alert(e.message); }
    const body = $('langRows');
    body.innerHTML = '';
    if (!langs.length) return emptyRow(body, 5, 'No languages yet. Add the first one.');

    langs.forEach((l) => {
        const tr = document.createElement('tr');
        cell(tr, l.name);
        cell(tr, l.judge0_id);
        cell(tr, l.image || '—', 'mono');

        const st = cell(tr, '');
        const pill = document.createElement('span');
        pill.className = 'status ' + l.judge_status;
        pill.textContent = STATUS_TEXT[l.judge_status] || l.judge_status;
        st.appendChild(pill);
        if (l.judge_error) {
            const d = document.createElement('div');
            d.className = 'err-detail';
            d.textContent = l.judge_error;
            st.appendChild(d);
        }

        const extra = ['error', 'missing'].includes(l.judge_status) && l.image
            ? [button('Retry', 'ghost small', () => retryLang(l))]
            : [];
        actions(tr, () => openLang(l), () => deleteLang(l), extra);
        body.appendChild(tr);
    });

    // ยังมีภาษาที่กำลังติดตั้ง → โหลดสถานะใหม่ทุก 5 วินาที
    if (langs.some((l) => l.judge_status === 'pulling')) {
        langPoll = setTimeout(loadLangs, 5000);
    }
}

function fillLangForm(src) {
    $('l_judge0_id').value = src?.judge0_id ?? '';
    LANG_TEXT.forEach((k) => ($('l_' + k).value = src?.[k] ?? ''));
}

function openLang(l) {
    editingLang = l || null;
    $('langDlgTitle').textContent = l ? 'Edit language' : 'Add language';
    $('l_preset').value = '';
    $('l_preset').disabled = !!l;
    fillLangForm(l);
    $('langErr').textContent = '';
    $('langDlg').showModal();
}

function readLangForm() {
    const row = { judge0_id: parseInt($('l_judge0_id').value, 10) };
    LANG_TEXT.forEach((k) => (row[k] = $('l_' + k).value.trim()));
    return row;
}

async function saveLang() {
    const row = readLangForm();
    if (!row.name || Number.isNaN(row.judge0_id)) return ($('langErr').textContent = 'Name and Judge0 ID are required.');
    if (!row.image || !row.file_name || !row.run_cmd) return ($('langErr').textContent = 'Image, file name and run command are required.');

    const btn = $('langSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try { await (editingLang ? api('PUT', '/languages/' + editingLang.id, row) : api('POST', '/languages', row)); }
    catch (e) { return ($('langErr').textContent = e.message); }
    finally { btn.disabled = false; btn.textContent = 'Save language'; }

    $('langDlg').close();
    loadLangs();
}

// ส่งข้อมูลเดิมให้ judge ติดตั้งใหม่
async function retryLang(l) {
    const row = { judge0_id: l.judge0_id };
    LANG_TEXT.forEach((k) => (row[k] = l[k] ?? ''));
    try { await api('PUT', '/languages/' + l.id, row); } catch (e) { return alert(e.message); }
    loadLangs();
}

async function deleteLang(l) {
    if (!confirm(`Delete language "${l.name}"? Its Docker image will also be removed from the judge server.`)) return;
    try { await api('DELETE', '/languages/' + l.id); } catch (e) { return alert(e.message); }
    loadLangs();
}

// ===== presets =====
LANG_PRESETS.forEach((p, i) => {
    $('l_preset').appendChild(Object.assign(document.createElement('option'), { value: i, textContent: p.name }));
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
