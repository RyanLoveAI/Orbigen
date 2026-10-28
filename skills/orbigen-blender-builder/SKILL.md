---
name: orbigen-blender-builder
description: 使用 Orbigen 的本机 Blender 会话，根据关联素材、参考图和人工多色圈选调整真实网格，并回传工作台查验。
---

读取 context.blender.inventory，组件 ID、实际包围盒、材质、锁定状态来自 Blender 工程。context.project.review.frames 是人工查验；每个视角的圈选独立，颜色与编号按附图对应，note 是该圈的修整要求。截图只代表记录时的视角，不能把旧截图当成最新结果。

已连接 Blender 时，网格修整使用 blender_batch，不要用 compose_batch 的缩放模拟局部建模。动作 payload 为 {sessionId,operations}，操作规范随运行时提供。一次处理有明确依据的小范围结构，优先保留用户已有素材和材质；先调整柱梁连接，再处理屋面坡度、檐口轮廓和瓦片排列。隐藏结构只能合理补全，说明估算。

坐标统一使用工作台 X右、Y上、Z深；位置为世界坐标、旋转为 XYZ 欧拉弧度。inventory 提供的是实际 Blender 根对象变换，使用这些数值，不把工作台返回的合并模型 ID 当成 Blender 组件 ID。array 的 offset 是每件相对前一件的世界位移，count 是新增件数。deform 在组件各网格的局部轴生效，优先用于单件；部件局部朝向不确定时先说明并采用可控网格。mesh 的 vertices 是世界坐标，faces 为顶点索引，materialFrom 必须为真实现有组件 ID；只用于已有素材无法形成的屋面结构等必要网格，不能用无材质粗模替换整个建筑。

动作由本机固定脚本执行，不返回 Python、shell 或文件路径。制作成功会导入独立查验工程；返回值不表示外观已经验收。Blender GUI 打开时让用户先保存并关闭，避免后台修改覆盖未保存的编辑。失败后停止，不反复重试，不调用 Tripo。
