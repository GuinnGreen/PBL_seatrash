#!/usr/bin/env python3
"""Merge ICC 20 images into data/items.json to expand the game pool."""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS_PATH = ROOT / 'data' / 'items.json'
ICC_IMAGES_PATH = ROOT / 'data' / 'icc-images.json'
ICC_JS_PATH = ROOT / 'js' / 'icc.js'

# Hard-coded from js/icc.js (single source of truth for cat mapping + display name + hint)
ICC_ITEMS = [
    (1,  '01_pet_bottle.jpg',         '寶特瓶',          'beverage', '台灣海廢第 2 名。瓶身 + 瓶蓋常分開漂。'),
    (2,  '02_bottle_cap.jpg',         '塑膠瓶蓋',        'beverage', '台灣 + 全球海廢第 1 名。比瓶身更難回收。'),
    (3,  '03_food_container.jpg',     '其他飲料/食物容器','food',     '便當盒、外帶餐盒——常見到不行。'),
    (4,  '04_non_food_bottle.jpg',    '非食物的瓶罐',    'other',    '洗髮精、清潔劑、化學品的瓶子。'),
    (5,  '05_plastic_bag.jpg',        '塑膠提袋',        'food',     '台灣每人每年用掉 800 個。'),
    (6,  '06_food_wrapper.jpg',       '食品包裝袋',      'food',     '零食袋、糖果紙、餅乾包裝。'),
    (7,  '07_straw.jpg',              '吸管',            'food',     '改變一個國家政策的那種——案件 02。'),
    (8,  '08_takeaway_cup.jpg',       '外帶飲料杯',      'beverage', '手搖飲杯。台灣每年用 50 億個。'),
    (9,  '09_disposable_cutlery.jpg', '免洗餐具',        'food',     '筷子、叉子、湯匙——一次性的。'),
    (10, '10_glass_bottle.jpg',       '玻璃瓶',          'beverage', '會碎裂——但要 100 萬年才會分解。'),
    (11, '11_aluminum_can.jpg',       '鐵鋁罐',          'beverage', '可樂罐、啤酒罐。回收率比塑膠高。'),
    (12, '12_tetra_pak.jpg',          '鋁箔包/利樂包',   'beverage', '蘋果汁、豆漿那種——多層材料超難回收。'),
    (13, '13_fishing_tackle.jpg',     '釣魚用具',        'fishing',  '魚線、魚鉤、鉛塊——最危險。'),
    (14, '14_fishing_buoy.jpg',       '漁業浮球',        'fishing',  '蚵棚的橘色浮球。西部海岸超多。'),
    (15, '15_styrofoam.jpg',          '保麗龍浮筒',      'fishing',  '碎成沙子大小——白色污染主犯。'),
    (16, '16_boat_fender.jpg',        '漁船防碰墊',      'fishing',  '漁港邊常見，不太會跑到海邊。'),
    (17, '17_fishing_net.jpg',        '漁網與繩子',      'fishing',  '幽靈漁網——案件 03。'),
    (18, '18_cigarette_butt.jpg',     '菸蒂',            'hazard',   '全球海廢第 1 名！每年 4.5 兆根。'),
    (19, '19_toothbrush.jpg',         '牙刷',            'hazard',   '為什麼會在海邊？想想看。'),
    (20, '20_face_mask.jpg',          '口罩',            'hazard',   '2022 新增的第 20 項——疫情後變多。'),
]

# Map ICC id to icc-images.json key (so we can pull source URL + license)
ICC_KEY_MAP = {
    1: '01_pet_bottle', 2: '02_bottle_cap', 3: '03_food_container',
    4: '04_non_food_bottle', 5: '05_plastic_bag', 6: '06_snack_wrapper',
    7: '07_straw', 8: '08_drink_cup', 9: '09_cutlery',
    10: '10_glass_bottle', 11: '11_aluminum_can', 12: '12_carton',
    13: '13_fishing_tackle', 14: '14_fishing_buoy', 15: '15_styrofoam_float',
    16: '16_boat_fender', 17: '17_net_rope', 18: '18_cigarette_butt',
    19: '19_toothbrush', 20: '20_face_mask',
}


def main():
    with open(ITEMS_PATH, 'r', encoding='utf-8') as f:
        items_data = json.load(f)

    with open(ICC_IMAGES_PATH, 'r', encoding='utf-8') as f:
        icc_meta = json.load(f)

    existing_filenames = {it['filename'] for it in items_data['items']}
    added = 0

    for icc_id, img_fname, name, cat, hint in ICC_ITEMS:
        filename = f'images/icc/{img_fname}'
        if filename in existing_filenames:
            continue

        # Pull source/license from icc-images.json if available
        key = ICC_KEY_MAP.get(icc_id)
        meta = icc_meta.get(key, {}) if key else {}
        source_url = meta.get('url', '')
        if source_url.startswith('LOCAL:'):
            source_url = ''
        license_str = meta.get('license', '')
        artist = (meta.get('credit', '') or '').split(' / ')[0]

        entry = {
            'id': f'icc_{icc_id:02d}',
            'filename': filename,
            'category': cat,
            'label': name,
            'icc_item': icc_id,
            'hint': hint,
        }
        if source_url:
            entry['source'] = source_url
        if license_str:
            entry['license'] = license_str
        if artist:
            entry['artist'] = artist

        items_data['items'].append(entry)
        added += 1

    # Save with stable ordering
    with open(ITEMS_PATH, 'w', encoding='utf-8') as f:
        json.dump(items_data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'Added {added} ICC items')
    # Print distribution
    counts = {}
    for it in items_data['items']:
        c = it['category']
        counts[c] = counts.get(c, 0) + 1
    total = sum(counts.values())
    print(f'New distribution (total {total}):')
    for c, n in sorted(counts.items(), key=lambda x: x[1]):
        print(f'  {c}: {n}')


if __name__ == '__main__':
    main()
