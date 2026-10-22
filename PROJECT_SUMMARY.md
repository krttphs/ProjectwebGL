# สรุปโปรเจกต์ (Project Summary) — ฝั่ง Web

เกมเขียนโค้ดแบบ multiplayer (สูงสุด 4 คน/ห้อง) ที่ให้ผู้เล่น **แก้โจทย์เขียนโค้ด** ผ่านหน้าเว็บ
พร้อมตัวเกม **Unity WebGL** ที่ถูกฝังอยู่หน้าเดียวกัน (`/gamemode1`) แล้วคุยกันผ่าน JavaScript bridge

ฝั่ง web นี้เป็น "เจ้าบ้าน" ของทุกอย่าง: สมัคร/ล็อกอิน, matchmaking, ห้องเกม, ส่งโค้ดไปตัดเกรด
(Judge0), เก็บคะแนน/เหรียญ, แชท, เพื่อน, โปรไฟล์ และ admin จัดการโจทย์

> เอกสารคู่กัน: ฝั่งเกมอยู่ที่ `PROJECT_SUMMARY.md` + `GAME_WEB_BRIDGE.md` ของโปรเจกต์ Unity
> (โฟลเดอร์ `D:\My game\...`) — เอกสารนี้สรุปมุมฝั่งเว็บ

---

## 1. ข้อมูลโปรเจกต์

| หัวข้อ | ค่า |
|---|---|
| ชื่อ package | `coding_game` (`package.json`) |
| Runtime | Node.js + **Express 5** |
| Entry point | `server.js` |
| Database / Auth / Storage | **Supabase** (`@supabase/supabase-js`) |
| Frontend | HTML (views) + **Tailwind CSS 4** + vanilla JS |
| Code Judge | **Judge0** (container แยก) ผ่าน `/run` |
| ภาษาที่รองรับ | Java 21 (`62`), JavaScript Node 20 (`63`), Python 3.12 (`71`) |
| Realtime | Supabase Realtime — `postgres_changes` + `broadcast` |
| Auth ที่หน้าเว็บ | Cookie `token` = Supabase access token (httpOnly, 1 ชม.) |
| Unity Build ที่ฝัง | Unity `6000.3.7f1` (Unity 6.3) — `public/Build/` |
| ไฟล์อัปโหลด | multer (memory, สูงสุด 6 MB, รับเฉพาะ image) → bucket `avatars` |

---

## 2. หน้าเว็บ (views) และเส้นทาง

เส้นทางทั้งหมดประกาศใน `server.js`

| Path | View (`views/`) | Middleware | หมายเหตุ |
|---|---|---|---|
| `/`, `/landing` | `landing.html` | — | หน้าแรก/โปรโมต |
| `/login` | `login.html` | `hasAuth` | ถ้าล็อกอินแล้วเด้งไป `/mainmenu` |
| `/mainmenu` | `mainMenu.html` | `requireAuth` | เมนูหลัก |
| `/profile` | `profile.html` | `requireAuth` | โปรไฟล์ผู้ใช้ |
| `/lobby` | `lobby.html` | `requireAuth` | หาห้อง/แชท/เพื่อน |
| `/gamemode1` | `gameMode1.html` | `requireAuth` | **หน้าเล่นเกม** (ฝัง Unity + code editor) |
| `/admin` | `admin.html` | `requireAdmin` | จัดการโจทย์/ภาษา |

---

## 3. โครงสร้างโฟลเดอร์

```
ProjectwebGL/
├── server.js                 # Express app + mount routes + serve views
├── checkEnv.js               # เช็คว่าโหลด .env ครบ
├── config/
│   ├── supabaseClient.js     # client ปกติ (service role) + supabaseAuth (anon)
│   └── supabaseAdmin.js      # client สำหรับ admin (service role, ข้าม RLS)
├── middleware/
│   ├── authMiddleware.js     # requireAuth / hasAuth
│   └── adminMiddleware.js    # requireAdmin (requireAuth + เช็ค role)
├── routes/                   # API ทั้งหมด (ดูข้อ 4)
├── views/                    # หน้า HTML (ดูข้อ 2)
└── public/                   # static (เสิร์ฟที่ /)
    ├── Build/                # Unity WebGL build (data/framework/wasm/loader)
    ├── css/                  # สไตล์ต่อหน้า + Tailwind (input.css → output.css)
    ├── js/                   # สคริปต์ฝั่งเบราว์เซอร์ (gameMode1.js สำคัญสุด)
    ├── img/                  # รูป
    └── TemplateData/         # ไฟล์ของ Unity template
```

---

## 4. Backend routes (API)

เส้นทางทั้งหมดอยู่ใต้ `/api/*`

### `routes/auth.js` — `/api/auth`

| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/register` | สมัคร: เช็ค username/email ซ้ำ → `auth.signUp` → upsert ตาราง `users` (coins=0) |
| POST | `/login` | `signInWithPassword` → set cookie `token` (httpOnly, sameSite=lax) |
| GET | `/me` | คืน `id, email, username, coins` ของผู้ใช้ปัจจุบัน |
| POST | `/logout` | ลบ cookie |

### `routes/lobby.js` — `/api/lobby`

| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/find-match` | matchmaking: ถ้ามีห้องค้าง (`waiting`/`full`) กลับห้องเดิม, ไม่งั้นหาห้องว่าง `< 4` คน, ถ้าไม่มีก็สร้างใหม่ (leader) |
| POST | `/start` | leader ตั้ง `morning_time, noon_time, evening_time` + เปลี่ยน status → `loading` |
| DELETE | `/leave` | leader ออก = ลบห้อง + player, คนอื่นออก = ลบตัวเอง (ห้อง `full` → กลับเป็น `waiting`) |
| GET | `/:roomId/players` | นับจำนวนผู้เล่นในห้อง |

### `routes/game.js` — `/api/game` (หัวใจของโหมดเล่น)

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/room/:roomId` | ดึงเวลา (`morning/noon/evening_time`), `end_time`, `status` |
| POST | `/endgame/:roomId` | ถ้าหมดเวลา → set `finished` + `duration_time`; แล้วเรียก RPC `claim_player_reward` |
| POST | `/ready` | upsert `player_ready_status`; ถ้าทุกคน ready + `loading` → set `playing` + `end_time` |
| POST | `/quests/random` | สุ่มโจทย์ (easy/medium/hard) ผ่าน RPC `get_random_quest` แล้วตั้ง `current_quest_id` (ได้เฉพาะตอนไม่มีโจทย์ค้าง) |
| PATCH | `/mycomputer` | จองเครื่อง 컴พิวเตอร์ (`computer_id`) กันชนกับคนอื่น |
| GET | `/mycomputer/:roomId` | ดูเครื่องที่ตัวเองจองไว้ |
| POST | `/giveup` | ยอมแพ้โจทย์ปัจจุบัน → ตัดคะแนน -25 ผ่าน RPC `finish_quest` |
| GET | `/computerCode/:roomId/:comId` | ดูโจทย์+โค้ดของเครื่อง (ใช้ตอนเปิดดูเครื่องเพื่อน) |
| PATCH | `/code-part2-part3` | เซฟโค้ด `code_part_2` / `code_part_3` ของเครื่อง |
| PATCH | `/updateProgress` | อัปเดตความคืบหน้าห้อง ผ่าน RPC `update_room_progress` |
| GET | `/languages` | รายการภาษาจากตาราง `languages` (name, judge0_id) |
| POST | `/submissions` | **ส่งโค้ดไป Judge0** (ดูข้อ 5.4) |

**กติกาคะแนน:** ตอบถูก **+50** (`SCORE_CORRECT`), ผิด/ยอมแพ้ **-25** (`SCORE_WRONG`)
เทียบคำตอบด้วย `normalize()` (ตัด `\r\n`, ช่องว่างท้ายบรรทัด, บรรทัดว่างหัว-ท้าย)

### `routes/friends.js` — `/api/friends`

`/search` (ค้นหา user), `/request` (ส่งคำขอ), `/pending` (คำขอที่รอ), `/accept` (ตอบรับ 2 ฝั่ง), `/list` (รายชื่อเพื่อน)
ความสัมพันธ์เก็บเป็น array `friends` / `friend_requests` ในตาราง `users`

### `routes/chat.js` — `/api/chat`

`/open` (หา/สร้าง room แชท โดยเรียง user1<user2 กันซ้ำ), `/:roomId/messages` (ประวัติ), `/send` (ส่งข้อความ)

### `routes/profile.js` — `/api/profile`

`GET /` และ `PATCH /` จัดการ `bio` + `profile_image`

### `routes/user.js` — `/api/user`

`/profile`, `/profile/image` (อัปโหลดผ่าน multer → bucket `avatars` → เซฟ public URL), `/balance`, `/profile` (PATCH)

### `routes/adminRoutes.js` — `/api/admin`

`router.use(requireAdmin)` — CRUD `/quests` และ `/languages` แบบ generic ผ่าน `supabaseAdmin` (service role ข้าม RLS)

### `routes/quests.js`

ว่างเปล่า (ไม่ได้ใช้งาน)

---

## 5. ระบบเกมฝั่งเว็บ (`public/js/gameMode1.js`)

นี่คือสคริปต์หลักที่ผูก Unity + หน้าเว็บ + backend เข้าด้วยกัน

### 5.1 โหลด Unity
- โหลด `Build/Build.loader.js` → `createUnityInstance(canvas, config)`
- `config` ชี้ `Build.data / Build.framework.js / Build.wasm`
- หลังโหลดเสร็จ: set `captureAllKeyboardInput = false`, แสดง `#waiting-screen`
- อ่าน `roomId` จาก query string (`?roomId=...` ที่ส่งมาจาก lobby)
- เรียก `POST /api/game/ready` แล้ว `subscribeGameStatus(roomId)`
- ดึง `GET /api/game/mycomputer/:roomId` → ถ้ามีเครื่อง ให้ `SendMessage("GameManager","RestoreMyComputer", id)`

### 5.2 สถานะ/เวลา
- `subscribeGameStatus` เปิด Supabase channel `game-room-<roomId>` ดู `game_rooms`
  - `status = playing` → ปิด waiting screen, เริ่ม `startTimer()`
  - `status = finished` → เรียก `endGame()`
- `startTimer()` ส่ง `SendMessage("GameManager","SetupTime","morning,noon,evening")` แล้วนับถอยหลังโชว์ `#timer-display`

### 5.3 Code editor UI
- 3 ช่อง: `code-part1` (setup ของโจทย์, readonly), `code-part2` (ไส้ฟังก์ชัน), `code-part3` (execution)
- กด Tab ย่อหน้าได้ในช่อง 2/3
- ดัก `keydown/keypress/keyup` ที่ window แบบ capture เพื่อ **ตัดการรับคีย์ของ Unity** ขณะโฟกัส textarea
- เลือกภาษา (`#lang`) แล้วโหลด `setup_code_java/js/python` ของโจทย์มาใส่ช่อง 1
- `setEditorOpen()` มี 2 panel: `#editor-panel` (มีโจทย์) และ `#getATask-panel` (ปุ่มสุ่มโจทย์)

### 5.4 Run / Submit
- **Run** → `POST /api/game/submissions` (`type:"run"`) โชว์ stdout/compile error/TLE
- **Submit** → `POST /api/game/submissions` (`type:"submit"`)
  - backend เทียบคำตอบกับ `expected_output` → คืน `{ success, status, score }`
  - ฝั่งเว็บ: `setScoreUI(result.score)` + `SendMessage("GameManager","SpawnResultBall", correct|wrong)`
  - + แจ้ง `SendMessage(currentObjectId,"UpdateHavingTask","false")`
- **Give up** → `POST /api/game/giveup` → spawn ลูกบอล "wrong"
- ฝั่ง backend `/submissions`:
  - จำกัด `language_id` ∈ {62, 63, 71}
  - หาเจ้าของเครื่องจาก `room_players` (submit ได้เฉพาะเจ้าของเครื่อง)
  - ยิงไป `${JUDGE_URL}/run` พร้อม header `x-judge-secret` (timeout 90s)
  - ตัดคะแนนผ่าน RPC `finish_quest` (`SCORE_CORRECT`/`SCORE_WRONG`)

### 5.5 คะแนน / Progress
- `setScoreUI()` อัปเดต `#score-number` จาก `result.score`
- `updateProgress()` (+ `PATCH /api/game/updateProgress`) ปรับแถบ `#progress-bar-full` (0–100)
- `PROGRESS_INCREMENT_DECREMENT` = 10 / 20 / 30 ตามระดับ easy/medium/hard
- `window.OnBallSubmitted(ballName)` — Unity เรียกตอนวางบอลที่โต๊ะ: ชื่อมี `green` → +progress, `red` → -progress

### 5.6 โค้ดซิงก์กับเพื่อน (`setupCodeSync`)
- เปิด Supabase channel `sync-<roomId>-<computerId>` แบบ **broadcast**
- พิมพ์ในช่อง 2/3 → broadcast `typing` ให้อีกฝั่ง (คงตำแหน่ง cursor)
- auto-save หลังหยุดพิมพ์ 3 วิ → `PATCH /api/game/code-part2-part3`
- ถ้าเครื่องไม่ใช่ของตัวเอง (`isMine=false`) จะซ่อนปุ่ม Submit (แต่ยัง Run ได้)

### 5.7 จบเกม
- `endGame()` → `POST /api/game/endgame/:roomId` → โชว์ `#summary-modal` (คะแนน + เหรียญ = คะแนนถ้า > 0)

---

## 6. Realtime (Supabase channels) ที่ฝั่งเว็บใช้

| Channel | ไฟล์ | ประเภท | ใช้ทำอะไร |
|---|---|---|---|
| `game-room-<roomId>` | `gameMode1.js` | `postgres_changes` (`game_rooms`) | จับ `playing` → เริ่มเกม, `finished` → จบเกม |
| `sync-<roomId>-<computerId>` | `gameMode1.js` | `broadcast` | ซิงก์โค้ดระหว่างเพื่อนร่วมเครื่อง |
| `lobby-<roomId>` | `lobby.js` | `postgres_changes` (`game_rooms` + `room_players`) | leader กดเริ่ม → ย้ายทุกคนเข้า `/gamemode1`, อัปเดตจำนวนคน |
| `chat-<roomId>` | `lobby.js` | `postgres_changes` (`chat_messages`) | แชทแบบเรียลไทม์ |

> ฝั่งเบราว์เซอร์ใช้ Supabase client จาก `public/js/supabaseBrowser.js` (`window.supabase`) ด้วย **anon key**

---

## 7. Web ↔ Game Bridge (มุมฝั่งเว็บ)

Unity build ถูกฝังเป็น `<canvas id="unity-canvas">` ในหน้า `/gamemode1`
ทั้งสองฝ่ายคุยผ่าน JavaScript 2 ทิศทาง (ดูรายละเอียดฝั่ง Unity ที่ `GAME_WEB_BRIDGE.md`)

```
Unity (C#) --[DllImport]--> .jslib --► window.* (JS ฝั่งเว็บ)     : Unity → Web
Unity (C#) ◄────── unityInstance.SendMessage("GO","Method",value) : Web → Unity
```

### 7.1 ฟังก์ชัน `window.*` ที่ฝั่งเว็บเป็นคนกำหนด (Unity เรียก)

ประกาศใน `public/js/gameMode1.js`

| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---|---|---|
| `window.ShowCodeEditor(dataString)` | `453` | เปิด UI editor/terminal ตาม `objectId\|uiType\|isMine` |
| `window.HideCodeEditor(dataString)` | `546` | ปิด editor + ยกเลิก channel sync |
| `window.ShowEditorButton(dataString)` | `564` | โชว์ปุ่ม `#toggle-editor-btn` (ข้อความตาม uiType) |
| `window.HideEditorButton(dataString)` | `579` | ซ่อนปุ่ม + ปิด panel |
| `window.ForceCloseWebUI()` | `741` | บังคับปิด editor/terminal (ความเครียด ≥ 100) |
| `window.AlertMessageStress()` | `751` | แจ้งเตือน `#stress-message` (3 วิ) |
| `window.AlertMessageOwnAComputer()` | `766` | แจ้งเตือน `#own_a_computer_message` (3 วิ) |
| `window.OnBallSubmitted(ballName)` | `140` | ปรับ progress ตามสีลูกบอลที่วางที่โต๊ะ |

### 7.2 เมธอด Unity ที่ฝั่งเว็บเรียก (`unityInstance.SendMessage`)

| GameObject | Method | ค่า | ใช้เมื่อ |
|---|---|---|---|
| `GameManager` | `SpawnResultBall` | `"correct"` / `"wrong"` | submit / give up |
| `GameManager` | `SetupTime` | `"morning,noon,evening"` | เริ่มเกม |
| `GameManager` | `RestoreMyComputer` | `computerId` | กลับเข้าห้องแล้วกู้เครื่องเดิม |
| `<objectId>` | `UpdateHavingTask` | `"true"` / `"false"` | มี/ไม่มีงานค้าง |
| `<objectId>` | `OnWebEditorClosed` | `""` | ปิด editor แล้วปลดล็อกผู้เล่น |

### 7.3 รูปแบบข้อมูล

สตริงเส้นเดียวคั่นด้วย `|` ให้ฝั่งรับแยกเอง เช่น
```js
// Unity ➜ Web
window.ShowCodeEditor("ComputerName|editor|true");  // objectId | uiType | isMine
// Web ➜ Unity
unityInstance.SendMessage("GameManager", "SpawnResultBall", "correct");
```

### 7.4 Flow ตัวอย่าง 1 รอบ

```
ผู้เล่นกด E ที่คอม  → Unity: OpenWebEditor("ComputerName|editor|true")
                    → web: ShowCodeEditor() → เช็ค myComputerId, โหลดโจทย์/โค้ดเพื่อน
                    → setupCodeSync() เปิด channel ซิงก์โค้ด

สุ่มโจทย์          → POST /api/game/quests/random → SendMessage(obj,"UpdateHavingTask","true")

กด Submit          → POST /api/game/submissions (type=submit)
                    → setScoreUI(score)
                    → SendMessage("GameManager","SpawnResultBall","correct"/"wrong")
                    → SendMessage(obj,"UpdateHavingTask","false")

ปิด editor         → SendMessage(obj,"OnWebEditorClosed") → ปลดล็อก
```

---

## 8. Environment และการรัน

`.env` (ดูตัวอย่างค่าได้จากไฟล์ในโปรเจกต์ — **อย่า commit**)

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `PORT` | พอร์ต server (default 3000) |
| `SUPABASE_URL` | URL ของโปรเจกต์ Supabase |
| `SUPABASE_ANON_KEY` | ใช้ฝั่ง browser + `supabaseAuth` |
| `SUPABASE_SERVICE_ROLE_KEY` | ใช้ฝั่ง server (ข้าม RLS) + admin |
| `JUDGE_URL` | base URL ของ Judge0 (เช่น Azure) |
| `JUDGE_SECRET` | ส่งเป็น header `x-judge-secret` ไปยัง judge |

คำสั่ง (จาก `package.json`)

```
npm start        # node server.js
npm run dev      # nodemon server.js
npm run css      # tailwindcss --watch (input.css → output.css)
node checkEnv.js # ตรวจว่าโหลด .env ครบ
```

> ⚠️ **ห้ามรันผ่าน `file://`** — Unity WebGL / JS interop ต้องรันผ่าน `http://` หรือ `https://`

---

## 9. ตาราง (Supabase) ที่ฝั่งเว็บอ้างอิง

| ตาราง | ใช้ที่ | หมายเหตุ |
|---|---|---|
| `users` | auth, friends, profile, admin | `username, coins, bio, profile_image, role, friends[], friend_requests[]` |
| `quests` | game, admin | `title, description, input_run, input_submit, expected_output, level, setup_code_*` |
| `languages` | game, admin | `name, judge0_id` |
| `game_rooms` | lobby, game | `leader_id, status, morning/noon/evening_time, end_time, duration_time` |
| `room_players` | lobby, game | `player_id, computer_id, current_quest_id, code_part_2/3` |
| `player_ready_status` | game | สถานะ ready ของแต่ละคน |
| `chat_rooms` / `chat_messages` | chat | แชท 1-1 (เรียง user1 < user2) |

**RPC ที่ใช้:** `get_random_quest`, `finish_quest`, `claim_player_reward`, `update_room_progress`

**Storage:** bucket `avatars` (public URL)

---

## 10. หมายเหตุ / ข้อควรระวัง

- `public/js/supabaseBrowser.js` ฝัง **anon key ตรง ๆ** ในโค้ด (ปกติของ anon key แต่ควรรู้)
- ไฟล์ `.env` อยู่ใน `.gitignore` แล้ว แต่ถ้าเคย commit ไปแล้วยังอยู่ใน history — ควร **rotate** `SUPABASE_SERVICE_ROLE_KEY` และ `JUDGE_SECRET`
- เส้นทาง `/admin` และ `/api/admin` ใช้ `supabaseAdmin` (service role) — ระวังอย่าให้หลุดฝั่ง client
- `routes/quests.js` เป็นไฟล์ว่าง ไม่ได้ถูก mount
- `gameMode1.js` ยาว (~900 บรรทัด) และพึ่ง `unityInstance` แบบ global — ถ้า instance ยังไม่พร้อม `SendMessage` จะเงียบ ๆ ไม่ error
- คะแนนเป็นแบบ **ต่อผู้เล่น** (per-player) คำนวณจาก backend ไม่ใช่จากบอลโดยตรง
