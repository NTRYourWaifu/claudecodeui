# CloudCLI 啟動指令速查

## 平常用 .bat（雙擊）

| 檔案 | 做什麼 | 用在 |
|---|---|---|
| `restart-prod.bat` | 殺舊 :3001 + 跑新 prod（**不 build**，Claude 改完會幫你 build） | 改完程式碼要上線、手機要看到結果 |
| `dev.bat` | 開 vite 5173 + nodemon 3001 | 本機調 UI、要 hot reload |

兩個都會卡在前景，**按 Ctrl+C** 結束。

## npm 指令（手打）

| 指令 | 等同 |
|---|---|
| `npm run build` | 前端 vite build + server tsc，產 `dist/` 和 `dist-server/` |
| `npm run server` | 跑 prod，吃已 build 好的檔（**不重 build**） |
| `npm start` | `build` + `server`（最完整、最慢） |
| `npm run dev` | 同 `dev.bat` |
| `npm run typecheck` | 跑 tsc 型別檢查，不產檔 |
| `npm run lint` | ESLint |

## 常見情境

- **改完程式想看效果** → 雙擊 `restart-prod.bat`
- **只想本機快速試 UI** → 雙擊 `dev.bat`（但手機可能連不上 5173，看下方）
- **拉了新版** → 先 `npm install`，再 `restart-prod.bat`

## 5173 連不上手機？

dev 模式手機要連 `http://<Tailscale IP>:5173`，常見原因：

1. **Windows 防火牆擋 5173**：控制台 → Windows Defender 防火牆 → 進階設定 → 輸入規則，找 Node.js 那條打開（或新增 5173 TCP 放行）
2. **vite 還沒起來**：等到看到 `ready in xxxx ms` 再連

如果懶得處理 5173，直接 `restart-prod.bat`，prod 一律走 3001。

## 已知問題

- `npm install` / `npm update` 會**覆蓋你動過的 SDK 內部檔案**（如 `node_modules/@anthropic-ai/claude-agent-sdk`），動了 SDK 內部後別亂跑這兩個指令

## Anthropic 新 model 發佈時的跟版流程

Anthropic 改版頻率高（半年內 4.5 → 4.6 → 4.7 → 4.8）。CloudCLI 不用大改，**3 個檔加一行驗證**就跟上：

1. **加 model ID** → [shared/modelConstants.js](shared/modelConstants.js)
   - `CLAUDE_MODELS.OPTIONS` 加一條新項目 `{ value: "claude-opus-4-X", label: "Opus 4.X" }`，**放陣列第一個**
   - `DEFAULT` 換成新 ID
2. **更新 effort 過濾規則** → [src/components/chat/view/subcomponents/ClaudeQuickControls.tsx](src/components/chat/view/subcomponents/ClaudeQuickControls.tsx)
   - 看 Anthropic [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) 表格的「Extended thinking / Adaptive thinking」欄
   - 沒 adaptive thinking → 加進 `NO_ADAPTIVE_THINKING` set
   - `getSupportedEfforts()` 加新 model 對應的 effort 集合
3. **驗證 CLI 認得新 ID**：
   ```
   claude --model claude-opus-4-X --print hi
   ```
   有回話就 OK，可以重啟 dev/prod 直接用。

整套流程通常 5 分鐘內。CLI/SDK 不用改任何 code——`--model` 是純字串透傳。