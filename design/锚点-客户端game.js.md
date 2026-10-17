# 客户端 game.js 重定位锚点清单

用途：`online/public/game.js` 仍在被并发改写，行号会漂移；本清单只给「唯一子串」，任何时刻用它 grep 即可重新定位。
生成时的 revision 快照（仅供参考，不是承诺）：3218 行 / SHA256 `4DFFE7BA99A183C1C7BD906A0799F42714D34D83F2B1CDA238E03D9D45D1EE88` / 2026-10-17 20:35。子串含空格与标点，均为唯一命中。

## 主锚点（18 条，按父代理指定范围）

| 函数 / 位置 | 唯一子串（grep 用） |
| --- | --- |
| adoptZone | `function adoptZone(nextZone, position) {` |
| loadRoomLocal | `function loadRoomLocal(roomId) {` |
| syncZoneBanner | `function syncZoneBanner() {` |
| drawRoomDoors | `function drawRoomDoors() {` |
| drawRoomExit | `function drawRoomExit(room) {` |
| openLootFor | `function openLootFor(container) {` |
| enterRoom | `function enterRoom(roomId, roomName) {` |
| leaveRoom | `function leaveRoom(roomName) {` |
| nearestInteractable | `function nearestInteractable() {` |
| nearbyEntities | `function nearbyEntities() {` |
| drawList | `function drawList() {` |
| draw() | `function draw() {` |
| step() | `function step(dt) {` |
| bakeSprites | `function bakeSprites() {` |
| drawWallPanel | `function drawWallPanel(f) {` |
| applySnapshot | `function applySnapshot(s) {` |
| openExploration | `function openExploration(kind, id = null) {` |
| loadFloorLocal（对照用） | `function loadFloorLocal(id) {` |

## 附加锚点（同一批新代码的其余落点，便于连带定位）

- 门外/门内候选：`function roomDoorCandidate() {` · `function roomExitCandidate() {`
- 进入/离开上行：`async function postZone(path, body, okText) {`
- 就近列表点击分流：`function activateNearby(kind, id) {`
- 物品格面板别名与关闭：`const LOOT = SID.lootGrid;` · `LOOT.open({` · `function closeLoot() {`
- 房间渲染分支：`const currentRoom = zoneId ? WORLD.roomById(zoneId) : null;` · `SCENE.roomWall(ctx, f2, currentRoom || { floorId })` · `SCENE.roomFloor(ctx, currentRoom)` · `SCENE.halls(ctx, f, glassDoorStates)`
- 分空间相机（唯一一条不唯一的锚点，共 3 处，按尾部参数区分）：`WORLD.zoneCamera(floorId, zoneId, viewW, viewH, self.x, self.y)` ×2（adoptZone / step 跟随自身）· `WORLD.zoneCamera(floorId, zoneId, viewW, viewH, cameraX + viewW / 2, cameraY + viewH / 2)` ×1（step 无自身时）
- 权威空间对账（快照内）：`const authZone = me.zoneId || null;`
- 权威层与房间切换入口：`function floorArrived(flight, res) {` · `function requestFloorChange(portalId, targetFloorId) {`
- 键盘总入口（E/J/K 分流）：`document.addEventListener('keydown', e => {`
- 画布点击分流：`canvas.addEventListener('click', e => {`

## 维护约定

1. 任何重命名/移动后，只改本文件的子串，不留行号。
2. 子串必须保持「含参数列表或独有语义」的粒度：`function draw() {` 之所以安全，是因为其余同类函数都带参数（`drawRoomDoors()`、`drawRoomExit(room)`、`drawWallPanel(f)`）。
3. 同时改动多个锚点时，直接按本清单批量 `Select-String -SimpleMatch` 校验，缺项会显示为 MISSING。
