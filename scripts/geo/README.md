# 疆域地图数据烘焙（B2）

构建 `public/geo/` 下的两个静态文件：

| 产物 | 内容 | 许可 |
|---|---|---|
| `public/geo/dynasties.json` | 6 朝疆域 MultiPolygon（秦/西汉/唐/元/明/清） | 见下表 |
| `public/geo/base.json` | 亚洲国家底图（Natural Earth 50m 提取） | public domain |

## 疆域数据来源

| 朝代 | 来源 | 许可 |
|---|---|---|
| 西汉（约前 100） | OpenHistoricalMap 关系 2692874（-107~-75） | CC0 |
| 明（约 1500） | OpenHistoricalMap 关系 2936889（1430–1617） | CC0 |
| 清（约 1760） | OpenHistoricalMap 关系 2889977（1755–1842） | CC0 |
| 秦/唐/元 | 合成：DataV 中国省级边界并集 + Natural Earth 国家多边形，按史载界线（阴山—长城、碎叶—葱岭、萨彦岭—外兴安岭等）裁切 | 真实海岸线，边界为示意 |

CHGIS（哈佛/复旦）虽是更权威的历史 GIS 数据，但其 EULA 禁止向第三方分发数据、
中国境内用户使用需复旦许可，故不采用。OHM 为 CC0，可自由分发再加工。

## 复现流程

```bash
npm run geo:fetch    # 下载原始数据到 raw/（幂等；已存在跳过，--force 强制重下）
npm run geo:build    # 从 raw/ 烘焙输出到 public/geo/
```

- `raw/` 已 gitignore，可随时重新下载。
- `asia-50m.json` 缺失时从 `node_modules/world-atlas`（TopoJSON）自动转换生成。
- OHM 数据经 Overpass API 获取并转 GeoJSON：**必须用 OHM 自己的实例**
  （ohm.kumi.systems 等），overpass-api.de 是 OpenStreetMap 的，关系 ID 不通用。
- 烘焙参数（简化精度、裁切线）在 compose.mjs 顶部与 makeQin/makeTang/makeYuan 内。
