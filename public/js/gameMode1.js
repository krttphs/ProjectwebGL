      var canvas = document.querySelector("#unity-canvas");
      var unityInstance = null; // เก็บ instance ไว้ใช้ภายนอก

      // --- Unity Loader Logic ---
      var buildUrl = "Build";
      var loaderUrl = buildUrl + "/Build.loader.js";
      var config = {
        dataUrl: buildUrl + "/Build.data",
        frameworkUrl: buildUrl + "/Build.framework.js",
        codeUrl: buildUrl + "/Build.wasm",
        streamingAssetsUrl: "StreamingAssets",
        companyName: "DefaultCompany",
        productName: "My Game",
        productVersion: "2.0.1",
      };
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";

      document.querySelector("#unity-loading-bar").style.display = "block";
      //ดึง roomId จาก URL (ที่ส่งมาจาก lobby)
      const urlParams = new URLSearchParams(window.location.search);
      const currentRoomId = urlParams.get("roomId");
      var script = document.createElement("script");
      script.src = loaderUrl;
      script.onload = () => {
        createUnityInstance(canvas, config, (progress) => {
          document.querySelector("#unity-progress-bar-full").style.width =
            100 * progress + "%";
        })
          .then((instance) => {
            unityInstance = instance;
            document.querySelector("#unity-loading-bar").style.display = "none";
            document.getElementById("waiting-screen").style.display = "flex";
            if (instance.Module) {
              instance.Module.captureAllKeyboardInput = false;
            }
            fetch("/api/game/ready", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roomId: currentRoomId }),
            });
            subscribeGameStatus(currentRoomId);
            fetch(`/api/game/mycomputer/${currentRoomId}`)
              .then((res) => res.json())
              .then((data) => {
                if (data.computer_id) {
                  myComputerId = data.computer_id;
                  unityInstance.SendMessage(
                    "GameManager",
                    "RestoreMyComputer",
                    myComputerId,
                  );
                }
              })
              .catch((err) =>
                console.error("Error fetching my computer:", err),
              );
          })
          .catch((message) => {
            alert(message);
          });
      };
      document.body.appendChild(script);
      // --- UI Functions ---
      let currentObjectId = null;
      let myComputerId = null;
      let currentObjectType = "editor";
      let editorOpen = false;
      let terminalOpen = false;
      function toggleWebUI() {
        if (currentObjectType === "terminal") {
          setTerminalOpen(!terminalOpen);
        } else {
          setEditorOpen(!editorOpen);
        }
      }

      window.addEventListener("resize", () => {
        canvas.style.width = window.innerWidth + "px";
        canvas.style.height = window.innerHeight + "px";
      });

      // ------- จัดการ input ใน editor -------
      (function () {
        const codePart2 = document.getElementById("code-part2");
        const codePart3 = document.getElementById("code-part3");

        // ฟังก์ชันสำหรับให้ผู้เล่นกดปุ่ม Tab เพื่อย่อหน้าโค้ดได้
        function handleTab(e) {
          if (e.key === "Tab") {
            e.preventDefault();
            let s = this.selectionStart;
            let ePos = this.selectionEnd;
            this.value =
              this.value.substring(0, s) + "\t" + this.value.substring(ePos);
            this.selectionStart = this.selectionEnd = s + 1;
          }
        }

        // อนุญาตให้กด Tab ได้ในช่องที่ 2 และ 3
        if (codePart2) codePart2.addEventListener("keydown", handleTab);
        if (codePart3) codePart3.addEventListener("keydown", handleTab);
      })();
      // -------- Ball Progress (Red/Green) --------
      // ปรับค่าเพิ่ม/ลดต่อลูกบอล 1 ลูกได้ตามต้องการ
      const GREEN_BALL_INCREMENT = 10;
      const RED_BALL_DECREMENT = 10;
      const BALL_PROGRESS_DISPLAY_MS = 5000; // แสดง bar ค้างไว้กี่ ms หลังบอลมาถึง

      let ballProgress = 0; // เริ่มต้นที่ 0 และห้ามต่ำกว่า 0 (0-100)
      let ballProgressHideTimeout = null;

      function setBallProgressUI(value) {
        const fill = document.getElementById("ball-progress-bar-full");
        if (fill) fill.style.width = value + "%";
      }
      setBallProgressUI(ballProgress);

      function showBallProgressBoard() {
        const board = document.getElementById("ball-progress-board");
        if (!board) return;

        board.classList.add("visible");

        clearTimeout(ballProgressHideTimeout);
        ballProgressHideTimeout = setTimeout(() => {
          board.classList.remove("visible");
        }, BALL_PROGRESS_DISPLAY_MS);
      }

      function updateBallProgress(delta) {
        ballProgress = Math.min(100, Math.max(0, ballProgress + delta));
        setBallProgressUI(ballProgress);
        
        // fetch("/api/game/updateBallProgress", {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({ roomId: currentRoomId, progress: ballProgress }),
        // });
      }

      // เรียกจากฝั่ง Unity (ผ่าน DeskBallBridge.jslib) ทุกครั้งที่มีคนกด E วางบอลที่โต๊ะ
      // ballName ที่ Unity ส่งมาคือชื่อ Object ของลูกบอล เช่น "GreenBall" หรือ "RedBall"
      window.OnBallSubmitted = function (ballName) {
        console.log("Unity ส่งบอลมาที่เว็บ:", ballName);

        const name = (ballName || "").toLowerCase();

        if (name.includes("green")) {
          updateBallProgress(GREEN_BALL_INCREMENT);
          showBallProgressBoard();
        } else if (name.includes("red")) {
          updateBallProgress(-RED_BALL_DECREMENT);
          showBallProgressBoard();
        } else {
          console.warn(
            "[OnBallSubmitted] ไม่รู้จักชนิดของลูกบอล (ไม่มีคำว่า green/red ในชื่อ):",
            ballName,
          );
        }
      };

      let myScore = 0;
      async function updateScore(newScore) {
        myScore += newScore;
        const scoreNumber = document.getElementById("score-number");
        scoreNumber.textContent = myScore;
        try {
          await fetch("/api/game/updatePlayerScore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId: currentRoomId, score: myScore }),
          });
        } catch (err) {
          console.error("error message: ", err);
        }
      }
      // -------- Judge0 --------
      const runBtn = document.getElementById("runBtn");
      const output = document.getElementById("output");
      let timeout = null;
      let currentQuest = null;
      runBtn.addEventListener("click", async () => {
        if (!currentQuest) {
          output.textContent = "⚠️ กรุณาสุ่มโจทย์ก่อน";
          return;
        }
        clearInterval(timeout);
        let dots = 0;
        timeout = setInterval(() => {
          dots = (dots % 3) + 1;
          output.textContent = "⏳ กำลังรันโค้ด" + ".".repeat(dots);
        }, 500);

        const lang = document.getElementById("lang").value;
        const part1 = document.getElementById("code-part1").value;
        const part2 = document.getElementById("code-part2").value;
        const part3 = document.getElementById("code-part3").value;

        const finalCode = `${part1}\n${part2}\n${part3}`;

        try {
          let res = await fetch(
            "https://ce.judge0.com/submissions/?base64_encoded=false&wait=true",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source_code: finalCode,
                language_id: lang,
                stdin: currentQuest.input_run,
              }),
            },
          );
          let result = await res.json();
          console.log("โค้ดที่ส่งไปรัน:\n", finalCode);
          console.log("Judge0 ตอบกลับมาว่า:", result);
          clearInterval(timeout);
          if (result.stdout) {
            output.textContent =
              result.stdout +
              "\nเวลาที่ใช้: " +
              result.time +
              " วินาที" +
              "\nmomory ที่ใช้: " +
              result.memory +
              "KB";
          } else if (result.stderr)
            output.textContent = "Error:\n" + result.stderr;
          else if (result.compile_output)
            output.textContent = "Compile Error:\n" + result.compile_output;
          else output.textContent = "⚠️ ไม่พบ output";
        } catch (err) {
          clearInterval(timeout);
          output.textContent = "เกิดข้อผิดพลาด: " + err.message;
        }
      });
      function normalize(str) {
        return str.replace(/\r\n/g, "\n").trim();
      }
      //ส่ง Submit เข้า Unity
      const submitBtn = document.getElementById("submitBtn");
      let submitTimeout = null;
      document
        .getElementById("submitBtn")
        .addEventListener("click", async () => {
          if (!currentQuest) {
            output.textContent = "⚠️ กรุณาสุ่มโจทย์ก่อน";
            return;
          }

          clearInterval(submitTimeout);
          let dots = 0;
          submitTimeout = setInterval(() => {
            dots = (dots % 3) + 1;
            output.textContent =
              "ส่งโค้ดเรียบร้อยแล้ว ! \r⏳ กำลังรันโค้ด" + ".".repeat(dots);
          }, 500);

          const lang = document.getElementById("lang").value;
          const part1 = document.getElementById("code-part1").value;
          const part2 = document.getElementById("code-part2").value;
          const part3 = document.getElementById("code-part3").value;

          const finalCode = `${part1}\n${part2}\n${part3}`;

          try {
            let res = await fetch(
              "https://ce.judge0.com/submissions/?base64_encoded=false&wait=true",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source_code: finalCode,
                  language_id: lang,
                  stdin: currentQuest.input_submit, //ใช้ inputSubmit จากโจทย์
                }),
              },
            );

            let result = await res.json();
            clearInterval(submitTimeout);

            if (result.stdout) {
              isGetATask = false;
              await fetch("/api/game/currentQuest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  roomId: currentRoomId,
                }),
              });
              if (
                normalize(result.stdout) ===
                normalize(currentQuest.expected_output)
              ) {
                //เทียบกับ expectedOutput
                output.textContent = "เสร็จสิ้น！";
                // "ถูกต้อง!! ✅" +
                // "\nเวลาที่ใช้: " +
                // result.time +
                // " วินาที" +
                // "\nmemory ที่ใช้: " +
                // result.memory +
                // "KB" +
                // "\nรางวัล: " +
                // currentQuest.rewards +
                // "\nได้คะแนน: 50";
                if (unityInstance) {
                  unityInstance.SendMessage(
                    "GameManager",
                    "SpawnResultBall",
                    "correct",
                  );
                }
                updateScore(50);
              } else {
                output.textContent = "เสร็จสิ้น！";
                unityInstance.SendMessage(
                  "GameManager",
                  "SpawnResultBall",
                  "wrong",
                );
                updateScore(-25);
              }
              if (unityInstance && currentObjectId) {
                console.log("บอก unity ว่าจบ task แล้วที่ :", currentObjectId);
                unityInstance.SendMessage(
                  currentObjectId,
                  "UpdateHavingTask",
                  "false",
                );
              } else {
                console.warn(
                  "❌ ไม่มี objectId หรือ unityInstance",
                  currentObjectId,
                );
              }
            } else if (result.stderr) {
              output.textContent = "Error:\n" + result.stderr;
            } else if (result.compile_output) {
              output.textContent = "Compile Error:\n" + result.compile_output;
            } else {
              output.textContent = "⚠️ ไม่พบ output";
            }
          } catch (err) {
            clearInterval(submitTimeout);
            output.textContent = "เกิดข้อผิดพลาด: " + err.message;
          }
        });

      document
        .getElementById("randomQuestBtn")
        .addEventListener("click", async () => {
          try {
            let res = await fetch(`/api/game/quests/random`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomId: currentRoomId,
              }),
            });
            if (!res.ok) {
              throw new Error(`Server error: ${res.status}`);
            }

            let quest = await res.json();
            isGetATask = true;
            if (unityInstance && currentObjectId) {
              console.log("บอก unity ว่าได้ task แล้วที่ :", currentObjectId);
              unityInstance.SendMessage(
                currentObjectId,
                "UpdateHavingTask",
                "true",
              );
            } else {
              console.warn(
                "❌ ไม่มี objectId หรือ unityInstance",
                currentObjectId,
              );
            }

            currentQuest = quest;
            setEditorOpen(true);
            // แสดงผลใน UI
            document.getElementById("taskTitle").textContent = quest.title;
            document.getElementById("problem").value = quest.description;
            document.getElementById("difficulty").textContent = quest.level;
            console.log("ระดับความยาก:" + quest.level);
            output.textContent = "สุ่มได้โจทย์: " + quest.title + "\n";
            output.textContent += "Input ที่ใช้: " + quest.input_run + "\n";
            output.textContent +=
              "ผลลัพธ์ที่ต้องการ:\n" + quest.show_expect_output;
            document.getElementById("code-part1").value =
              currentQuest.setup_code_java;
            document.getElementById("code-part2").value =
              "// สร้างฟังก์ชันของคุณ...";
            document.getElementById("code-part3").value =
              "// เรียกใช้ฟังก์ชันที่นี่...";
          } catch (err) {
            console.error(err);
            output.textContent = "สุ่มโจทย์ไม่สำเร็จ: " + err.message;
          }
        });

      document.getElementById("lang").addEventListener("change", (e) => {
        if (!currentQuest) return;

        const langId = e.target.value;
        const codePart1 = document.getElementById("code-part1");

        if (langId === "62") {
          // Java
          codePart1.value = currentQuest.setup_code_java || "";
        } else if (langId === "63") {
          // JavaScript
          codePart1.value = currentQuest.setup_code_js || "";
        } else if (langId === "71") {
          // Python
          codePart1.value = currentQuest.setup_code_python || "";
        }
      });
      function back() {
        window.location.href = "/";
      }
      // ประกาศฟังก์ชันให้ Global (window) เพื่อให้ Unity หาเจอ
      // --- Editor Open/Close State ---

      function notifyUnityEditorClosed() {
        if (unityInstance && currentObjectId) {
          console.log("📤 ส่งกลับ Unity:", currentObjectId);
          unityInstance.SendMessage(currentObjectId, "OnWebEditorClosed");
        } else {
          console.warn("❌ ไม่มี objectId หรือ unityInstance", currentObjectId);
        }
      }
      let isGetATask = false;
      let friendTask = false;
      function setEditorOpen(open) {
        editorOpen = open;
        const editorPanel = document.getElementById("editor-panel");
        const getATaskPanel = document.getElementById("getATask-panel");
        const btn = document.getElementById("toggle-editor-btn");
        const codeTextarea = document.getElementById("code-part2");
        const unityCanvas = document.getElementById("unity-canvas");
        if (open) {
          btn.textContent = "Close Editor";

          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
          if (unityCanvas) {
            unityCanvas.tabIndex = -1;
            unityCanvas.style.pointerEvents = "none";
            unityCanvas.blur();
          }
          if (unityInstance && unityInstance.Module) {
            unityInstance.Module.captureAllKeyboardInput = false;
          }
          if (currentObjectId === myComputerId && isGetATask) {
            editorPanel.classList.remove("hidden");
            getATaskPanel.classList.add("hidden");
            setTimeout(() => {
              if (codeTextarea) codeTextarea.focus();
            }, 50);
          } else if (currentObjectId !== myComputerId && friendTask) {
            editorPanel.classList.remove("hidden");
            getATaskPanel.classList.add("hidden");
            setTimeout(() => {
              if (codeTextarea) codeTextarea.focus();
            }, 50);
          } else {
            getATaskPanel.classList.remove("hidden");
            editorPanel.classList.add("hidden");
          }
        } else {
          getATaskPanel.classList.add("hidden");
          editorPanel.classList.add("hidden");
        }
      }

      window.ShowCodeEditor = async function (dataString) {
        try {
          let parts = dataString.split("|");
          let objectId = parts[0];
          let uiType = parts[1] || "editor";
          let isMine = parts[2] === "true";
          currentObjectId = objectId;
          console.log(
            "Unity บอกให้เปิด UI ประเภท " + uiType + " ที่เครื่อง: " + objectId,
          );
          if (myComputerId == null && isMine) {
            const res = await fetch("/api/game/mycomputer", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                myComputer_id: objectId,
                roomId: currentRoomId,
              }),
            });
            const data = await res.json();
            myComputerId = data.computer_id;
          }
          if (!isMine) {
            const res = await fetch(
              `/api/game/computerCode/${currentRoomId}/${currentObjectId}`,
            );
            const data = await res.json();
            if (data && data.code.current_quest_id === null) {
              notifyUnityEditorClosed();
              return friendNotDoingTaskRNAlert();
            }
            currentQuest = data.quest;
            friendTask = true;
            document.getElementById("taskTitle").textContent = data.quest.title;
            document.getElementById("problem").value = data.quest.description;
            document.getElementById("difficulty").textContent =
              data.quest.level;
            output.textContent = "สุ่มได้โจทย์: " + data.quest.title + "\n";
            output.textContent +=
              "Input ที่ใช้: " + data.quest.input_run + "\n";
            output.textContent +=
              "ผลลัพธ์ที่ต้องการ:\n" + data.quest.show_expect_output;
            document.getElementById("code-part1").value =
              data.quest.setup_code_java; //ต้องแก้
            document.getElementById("code-part2").value =
              data.code.code_part_2 || "// สร้างฟังก์ชันของคุณ...";
            document.getElementById("code-part3").value =
              data.code.code_part_3 || "// เรียกใช้ฟังก์ชันที่นี่...";
            if (unityInstance) {
              unityInstance.SendMessage(
                currentObjectId,
                "UpdateHavingTask",
                "true",
              );
            }
          } else if (isMine && myComputerId !== null) {
            friendTask = false;
            const res = await fetch(
              `/api/game/computerCode/${currentRoomId}/${myComputerId}`,
            );
            const data = await res.json();
            if (data && data.code.current_quest_id === null) {
            } else {
              isGetATask = true;
              currentQuest = data.quest;
              document.getElementById("taskTitle").textContent =
                currentQuest.title;
              document.getElementById("problem").value =
                currentQuest.description;
              document.getElementById("difficulty").textContent =
                currentQuest.level;
              output.textContent = "สุ่มได้โจทย์: " + currentQuest.title + "\n";
              output.textContent +=
                "Input ที่ใช้: " + currentQuest.input_run + "\n";
              output.textContent +=
                "ผลลัพธ์ที่ต้องการ:\n" + currentQuest.expected_output;
              document.getElementById("code-part1").value =
                currentQuest.setup_code_java; //ต้องแก้
              document.getElementById("code-part2").value =
                data.code.code_part_2 || "// สร้างฟังก์ชันของคุณ...";
              document.getElementById("code-part3").value =
                data.code.code_part_3 || "// เรียกใช้ฟังก์ชันที่นี่...";
                if (unityInstance) {
              unityInstance.SendMessage(
                currentObjectId,
                "UpdateHavingTask",
                "true",
              );
            }
            }
          }
          setupCodeSync(currentRoomId, currentObjectId, isMine);
          if (uiType === "terminal") {
            currentObjectType = "terminal";
            setTerminalOpen(!terminalOpen);
          } else {
            currentObjectType = "editor";
            setEditorOpen(true);
          }
        } catch (error) {
          console.error("ShowCodeEditor: ", error);
        }
      };

      window.HideCodeEditor = function (dataString) {
        const editorBtn = document.getElementById("toggle-editor-btn");
        let parts = dataString.split("|");
        let objectId = parts[0];
        let uiType = parts[1] || "editor";
        console.log(
          "Unity บอกให้ปิด UI ประเภท " + uiType + " ที่เครื่อง: " + objectId,
        );
        currentObjectId = objectId;
        currentObjectType = "editor";
        editorBtn.innerText = "Open Editor";
        setEditorOpen(false);
        if (codingSyncChannel) {
          supabase.removeChannel(codingSyncChannel);
          codingSyncChannel = null;
        }
      };

      window.ShowEditorButton = function (dataString) {
        let parts = dataString.split("|");
        currentObjectId = parts[0];
        let uiType = parts[1] || "editor";

        const btn = document.getElementById("toggle-editor-btn");
        if (uiType === "terminal") {
          currentObjectType = "terminal";
          btn.innerText = "Open Terminal";
        } else {
          currentObjectType = "editor";
          btn.innerText = "Open Editor";
        }
        btn.style.display = "flex";
      };
      window.HideEditorButton = function (dataString) {
        let parts = dataString.split("|");
        currentObjectId = parts[0];

        const btn = document.getElementById("toggle-editor-btn");
        btn.style.display = "none";

        if (editorOpen) setEditorOpen(false);
        if (terminalOpen) setTerminalOpen(false);
      };

      const codeInput1 = document.getElementById("code-part1");
      const codeInput2 = document.getElementById("code-part2");
      const codeInput3 = document.getElementById("code-part3");
      const problemInput = document.getElementById("problem");
      const langSelect = document.getElementById("lang");

      const editableElements = [
        codeInput1,
        codeInput2,
        codeInput3,
        problemInput,
        langSelect,
      ];

      editableElements.forEach((el) => {
        if (!el) return;
        el.addEventListener("mousedown", () => {
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
          if (unityInstance && unityInstance.Module) {
            unityInstance.Module.captureAllKeyboardInput = false;
          }
        });
      });

      function subscribeGameStatus(roomId) {
        supabase
          .channel("game-room-" + roomId)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "game_rooms",
              filter: `id=eq.${roomId}`,
            },
            (payload) => {
              if (payload.new.status === "playing") {
                document.getElementById("waiting-screen").style.display =
                  "none";
                startTimer();
              }
            },
          )
          .subscribe();
      }

      let countdownInterval;

      async function giveUp() {
        updateScore(-25);
        isGetATask = false;
        await fetch("/api/game/currentQuest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: currentRoomId,
          }),
        });
        if (unityInstance) {
          unityInstance.SendMessage("GameManager", "SpawnResultBall", "wrong");
          if (currentObjectId) {
            console.log("บอก unity ว่าจบ task แล้วที่ :", currentObjectId);
            unityInstance.SendMessage(
              currentObjectId,
              "UpdateHavingTask",
              "false",
            );
          } else {
            console.warn(
              "❌ ไม่มี objectId หรือ unityInstance",
              currentObjectId,
            );
          }
        }
      }

      async function saveCode() {
        try {
          const code_part_2 = document.getElementById("code-part2").value;
          const code_part_3 = document.getElementById("code-part3").value;

          if (!currentRoomId || !currentObjectId) return;

          await fetch("/api/game/code-part2-part3", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId: currentRoomId,
              computerId: currentObjectId,
              codePart2: code_part_2,
              codePart3: code_part_3,
            }),
          });
          console.log("auto-saved code!");
        } catch (error) {
          console.error("failed to auto-save code");
        }
      }

      async function startTimer() {
        if (!currentRoomId) return;

        try {
          const res = await fetch(`/api/game/room/${currentRoomId}`);
          if (!res.ok) throw new Error("Fetch time error");
          const roomData = await res.json();
          if (unityInstance) {
            const timeString = `${roomData.morning_time},${roomData.noon_time},${roomData.evening_time}`;
            unityInstance.SendMessage("GameManager", "SetupTime", timeString);
          }
          //แปลงเป็น Timestamp
          const endTime = new Date(roomData.end_time).getTime();

          countdownInterval = setInterval(() => {
            const now = new Date().getTime();
            const distance = endTime - now;

            if (distance <= 0) {
              clearInterval(countdownInterval);
              endGame();
            } else {
              // คำนวณนาทีและวินาที
              let m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
              let s = Math.floor((distance % (1000 * 60)) / 1000);
              document.getElementById("timer-display").innerText =
                (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
            }
          }, 1000);
        } catch (err) {
          console.error("Timer start failed:", err);
        }
      }

      window.ForceCloseWebUI = function () {
        console.log("Unity สั่งบังคับปิด Editor!");

        document.getElementById("toggle-editor-btn").style.display = "none";

        if (editorOpen) setEditorOpen(false);
        if (terminalOpen) setTerminalOpen(false);
      };

      let isStressMessageShowing = false;
      window.AlertMessageStress = function () {
        if (isStressMessageShowing) {
          return;
        }
        console.log("เรียก AlertMessageStress");
        isStressMessageShowing = true;

        document.getElementById("stress-message").style.display = "flex";

        setTimeout(() => {
          document.getElementById("stress-message").style.display = "none";
          isStressMessageShowing = false;
        }, 3000);
      };
      let isOwn_a_computer_message_showing = false;
      window.AlertMessageOwnAComputer = function () {
        if (isOwn_a_computer_message_showing) {
          return;
        }
        console.log("เรียก AlertMessageOwnAComputer");
        isOwn_a_computer_message_showing = true;

        document.getElementById("own_a_computer_message").style.display =
          "flex";

        setTimeout(() => {
          document.getElementById("own_a_computer_message").style.display =
            "none";
          isOwn_a_computer_message_showing = false;
        }, 3000);
      };
      let is_not_right_now_message_showing = false;
      function friendNotDoingTaskRNAlert() {
        if (is_not_right_now_message_showing) {
          return;
        }
        is_not_right_now_message_showing = true;

        document.getElementById("not-right-now-message").style.display = "flex";

        setTimeout(() => {
          document.getElementById("not-right-now-message").style.display =
            "none";
          is_not_right_now_message_showing = false;
        }, 3000);
      }
      let codingSyncChannel = null;
      let autoSaveTimer = null;
      function setupCodeSync(roomId, computerId, isMine) {
        if (codingSyncChannel) {
          supabase.removeChannel(codingSyncChannel);
        }

        // สร้าง Channel โดยใช้ชื่อคอมพิวเตอร์
        codingSyncChannel = supabase.channel(`sync-${roomId}-${computerId}`);

        const part1 = document.getElementById("code-part1");
        const part2 = document.getElementById("code-part2");
        const part3 = document.getElementById("code-part3");
        const runBtn = document.getElementById("runBtn");
        const submitBtn = document.getElementById("submitBtn");

        //ปลดล็อกให้ทั้งสองคนแก้ไขโค้ดและเห็นปุ่ม Run/Submit ได้
        part2.readOnly = false;
        part3.readOnly = false;
        runBtn.style.display = "block";
        if (isMine) {
            submitBtn.style.display = "block";
        } else {
            submitBtn.style.display = "none";
        }
        //ดักรับข้อมูล Broadcast จากเพื่อนร่วมทีม
        codingSyncChannel
          .on("broadcast", { event: "typing" }, (payload) => {
            const { id, text } = payload.payload;
            const el = document.getElementById(id);

            if (el) {
              // เก็บตำแหน่ง Cursor ของเราไว้ก่อน เพื่อไม่ให้มันกระโดดเวลาค่าถูกอัปเดตจากเพื่อน
              const start = el.selectionStart;
              const end = el.selectionEnd;

              el.value = text;

              // คืนค่าตำแหน่ง Cursor ให้เราพิมพ์ต่อได้สมูทๆ
              el.setSelectionRange(start, end);
            }
          })
          .subscribe();

        //ส่งข้อมูล Broadcast ออกไปหาเพื่อนเวลาที่เราพิมพ์
        const broadcastCode = (e) => {
          codingSyncChannel.send({
            type: "broadcast",
            event: "typing",
            payload: { id: e.target.id, text: e.target.value },
          });
          clearTimeout(autoSaveTimer);
          autoSaveTimer = setTimeout(() => {
            saveCode();
          }, 3000);
        };

        // ผูก Event ให้ส่งข้อมูลเมื่อมีการเปลี่ยนแปลงในกล่องที่ 2 และ 3 (กล่อง 1 ปกติล็อคไว้ให้ดูโจทย์)
        part2.oninput = broadcastCode;
        part3.oninput = broadcastCode;
      }

      async function endGame() {
        try {
          const res = await fetch(`/api/game/endgame/${currentRoomId}`, {
            method: "POST",
          });
          if (!res.ok) {
            const data = await res.json();
            console.log("Error:", data.error);
          }

          document.getElementById("timer-display").innerText = "00:00";

          if (editorOpen) setEditorOpen(false);
          document.getElementById("toggle-editor-btn").style.display = "none";

          //ตัดการควบคุม Unity ไม่ให้ขยับตัวละครได้
          if (document.pointerLockElement) document.exitPointerLock();

          const finalScore = myScore;
          document.getElementById("final-score").innerText = finalScore;

          const coinsEarned = finalScore > 0 ? finalScore : 0;
          document.getElementById("final-coins").innerText = coinsEarned;

          document.getElementById("summary-modal").style.display = "flex";
        } catch (err) {
          console.error("Unable to end the game: ", err);
        }
      }
      // Unity bind keyboard listeners ที่ window ด้วย capture:true
      // วิธีเดียวที่ตัดได้คือดักที่ window capture phase ก่อน Unity
      // แล้วเช็คว่า activeElement เป็น textarea -> stopImmediatePropagation ตัด Unity
      // แต่ไม่ preventDefault เพื่อให้ browser ยังแสดงตัวอักษรใน textarea ได้ปกติ
      ["keydown", "keypress", "keyup"].forEach((evtType) => {
        window.addEventListener(
          evtType,
          (e) => {
            if (
              document.activeElement === codeInput1 ||
              document.activeElement === codeInput2 ||
              document.activeElement === codeInput3
            ) {
              e.stopImmediatePropagation();
              // ไม่ preventDefault — ให้ browser จัดการ input ตามปกติ
            }
          },
          true,
        ); // capture:true — ทำงานก่อน Unity listener
      });