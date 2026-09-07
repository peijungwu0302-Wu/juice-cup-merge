# 果汁碰碰杯 V5.3

手機優先的 3D 物理融合遊戲。V5.3 採「美術優先」混合架構：預設顯示 V4.6 的高品質預渲染杯子與跑道，同時由 V5 的 Rapier 3D 世界負責跑道、護欄、前牆及杯身碰撞。

## V5.3 重點

- 果汁珍藏、聖代工房、銀河酒窖各有七級獨立裝飾與配色，不共用同一批水果。
- 由原始高解析美術圖精確裁出 21 張獨立 RGBA 杯子，保留透明安全邊界，不會再切到相鄰杯子。
- 精緻杯以固定美術攝影機投影，杯身主接觸帶、左右護欄與前牆都和 Rapier 碰撞世界使用同一份規格。
- 跑道背景保持原始長寬比，不再隨手機螢幕橫向拉伸；中央等比例美術與 3D 攝影機在不同手機寬度使用同一映射。
- 固定美術攝影機增加約 12% 的可見縱深，但物理跑道仍維持 19.6，不改變力度、抵達時間或堆積空間。
- 木質護欄的金色內緣與前方金色擋條直接讀取物理碰撞規格，玩家看到的有效邊界就是實際反彈位置。
- 精緻預渲染、即時 3D、陽春三種顯示模式可在局中切換；切換只替換外觀，不會重建剛體或改變杯子位置、速度與碰撞結果。
- 果汁杯、聖代杯、酒杯共用五段 3D 物理包絡；杯口、上杯身、下杯身、杯腳分段碰撞，保留真實推擠與小杯穿隙的可能。
- 支援直線防手抖、角度鎖定後二次滑動、固定／手勢力度、反彈預測、動態危險線、最高級爆炸、無限局內 Undo 與不限次復活。
- 預設採精緻預渲染果汁；即時 3D 模式仍保留省電、平衡與電影畫質，陽春模式則可作為效能及碰撞比較基準。

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

從 V4.6 原始圖集重新擷取獨立杯子：

```bash
python tools/extract_v52_art.py
```

重新產生、輸出及驗證 V5.1 即時 3D 資產（Blender 5.2 以上）：

```bash
blender --background --python tools/blender/generate_v51_assets.py -- --output public/models
blender --background --python tools/blender/render_v51_assets.py -- --models public/models --output outputs --icons public/icons/v51
blender --background --python tools/blender/verify_v51_assets.py -- --models public/models --icons public/icons/v51
```

## 版本與復原

正式版以 Git tag 與 Sites 的不可變版本共同保存。`v5.0.0`、`v5.1.0`、`v5.2.0` 與 `v5.3.0` 都可獨立復原；回復線上版本時部署既有 Sites 版本即可，不必重新產生資產。
