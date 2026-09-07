# 果汁碰碰杯 V5

手機優先的 3D 物理融合遊戲。V5 使用 Blender 製作共用規格的杯體與跑道資產，由 Three.js / React Three Fiber 顯示，Rapier 3D 負責跑道、護欄、前牆及杯身碰撞。

## V5 重點

- 果汁杯、聖代杯、酒杯共用與美術外觀無關的 3D 物理包絡；遊戲中換造型不會改變位置或碰撞結果。
- 每個杯子使用底部、中段、杯口三段圓柱碰撞體，支援小杯從大杯縫隙通過，同時避免高速穿模。
- 跑道 GLB 與 Rapier 護欄、前牆使用同一組尺寸和透視座標。
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

重新產生及驗證 Blender 資產（Blender 5.2 以上）：

```bash
blender --background --python tools/blender/generate_v5_assets.py -- --output public/models
blender --background --python tools/blender/verify_v5_assets.py
```

## 版本與復原

正式版以 Git tag 與 Sites 的不可變版本共同保存。`v4.6.0` 是 V5 上線前的可復原版本；V5 發布後會另建 `v5.0.0`。回復線上版本時部署既有 Sites 版本即可，不必重新產生資產。
