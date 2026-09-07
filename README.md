# 果汁碰碰杯 V5.1

手機優先的 3D 物理融合遊戲。V5.1 使用 Blender 製作 21 款精品杯、獨立 HUD 圖示與精品跑道，由 Three.js / React Three Fiber 顯示，Rapier 3D 負責跑道、護欄、前牆及杯身碰撞。

## V5.1 重點

- 果汁吧、聖代工房、水晶酒窖各有七級獨立裝飾與配色，不再共用同一批水果。
- 果汁杯、聖代杯、酒杯共用杯口主導的五段 3D 物理包絡；遊戲中換造型不會改變位置或碰撞結果。
- 美術、Rapier 碰撞、護欄與前牆都讀取 `app/game/v51-asset-spec.json`，避免畫面與物理漂移。
- 21 張 HUD 圖示由各自的 3D 模型獨立渲染並保留透明安全邊界，不使用會切到相鄰杯子的合併大圖。
- 平衡模式會在長局隱藏舊杯子的冰塊與氣泡細節；省電模式停用高成本玻璃效果，電影模式保留完整材質。
- 支援直線防手抖、角度鎖定後二次滑動、固定／手勢力度、反彈預測、動態危險線、最高級爆炸、無限局內 Undo 與不限次復活。
- 預設採精緻果汁、平衡畫質；省電畫質會停用高成本玻璃透射與額外冰塊細節，長局的平衡畫質只保留近期杯子的微細裝飾，電影畫質則保留完整材質。

## 本機開發

需要 Node.js 22.13 以上與 pnpm。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

完整程式與物理驗證：

```bash
pnpm check:v5
```

重新產生、輸出美術檢查稿及驗證 Blender 資產（Blender 5.2 以上）：

```bash
blender --background --python tools/blender/generate_v51_assets.py -- --output public/models
blender --background --python tools/blender/render_v51_assets.py -- --models public/models --output outputs --icons public/icons/v51
blender --background --python tools/blender/verify_v51_assets.py -- --models public/models --icons public/icons/v51
```

## 版本與復原

正式版以 Git tag 與 Sites 的不可變版本共同保存。`v5.0.0` 是本次精品資產升級前的完整可復原版本；V5.1 發布後另建 `v5.1.0`。回復線上版本時部署既有 Sites 版本即可，不必重新產生資產。
