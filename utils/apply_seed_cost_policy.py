import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
config_path = root / "config.json"
planner_path = root / "scripts" / "planner.js"
index_path = root / "index.html"

config = json.loads(config_path.read_text())
crops = {crop["id"]: crop for crop in config["crops"]}

updates = {
    "ancient_fruit": (0, "Not sold for Gold. Obtain from the Museum recipe, Seed Maker, or other special sources. Gold seed cost is excluded."),
    "carrot": (0, "Not sold for Gold. Obtain from Seed Spots, Raccoon requests/trades, Seed Maker, or other special sources. Gold seed cost is excluded."),
    "summer_squash": (0, "Not sold for Gold. Obtain from Seed Spots, Raccoon requests/trades, Seed Maker, or other special sources. Gold seed cost is excluded."),
    "broccoli": (0, "Not sold for Gold. Obtain from Seed Spots, Raccoon requests/trades, Seed Maker, or other special sources. Gold seed cost is excluded."),
    "powdermelon": (0, "Not sold for Gold. Obtain from Seed Spots, Raccoon requests/trades, Seed Maker, or other special sources. Gold seed cost is excluded."),
    "fiber_seeds": (0, "Crafted after Linus's Community Cleanup special order. Not sold for Gold; Gold seed cost is excluded."),
    "qi_beans": (0, "Quest-only seed for Qi's Crop. Not sold for Gold; Gold seed cost is excluded and the crop is not auto-suggested."),
    "taro_tuber": (0, "Not sold for Gold. Exchange 2 Bone Fragments at the Island Trader or obtain from other sources; exchange resources are not converted to Gold cost."),
    "mango_tree": (0, "Not sold for Gold. Exchange 75 Mussels at the Island Trader or obtain from Ginger Island sources; exchange resources are not converted to Gold cost."),
    "banana_tree": (0, "Not sold for Gold. Exchange 5 Dragon Teeth at the Island Trader or 100 Calico Eggs at the Desert Festival; exchange resources are not converted to Gold cost."),
    "rice_shoot": (40, "Pierre sells Rice Shoots for 40g starting in Year 2. Base growth is 8 days (6 if irrigated/near water); planner assumes 8 days unless Irrigated is selected."),
    "tea_sapling": (750, "Traveling Cart purchase price starts at 750g; also craftable or exchangeable for 10 Calico Eggs at the Desert Festival. Takes 20 days to mature and produces Tea Leaves on days 22–28."),
    "coffee_bean": (2500, "Sold by the Traveling Cart for 2,500g; also obtainable as a monster drop."),
    "spring_seeds": (105, "Craftable from Spring forage; Traveling Cart price starts at 105g. Planner uses the minimum verified Gold purchase price."),
    "summer_seeds": (165, "Craftable from Summer forage; Traveling Cart price starts at 165g. Planner uses the minimum verified Gold purchase price."),
    "fall_seeds": (135, "Craftable from Fall forage; Traveling Cart price starts at 135g. Planner uses the minimum verified Gold purchase price."),
    "winter_seeds": (100, "Craftable from Winter forage; Traveling Cart price starts at 100g. Planner uses the minimum verified Gold purchase price."),
}

zero_gold = {"ancient_fruit", "carrot", "summer_squash", "broccoli", "powdermelon", "fiber_seeds", "qi_beans", "taro_tuber", "mango_tree", "banana_tree"}
exchange_only = {"taro_tuber", "mango_tree", "banana_tree"}
for crop_id, (buy, note) in updates.items():
    crop = crops[crop_id]
    crop["buy"] = buy
    crop["note"] = note
    if crop_id in zero_gold:
        crop["gold_purchasable"] = False
        crop["acquisition"] = "exchange" if crop_id in exchange_only else "not_sold"
    else:
        crop.pop("gold_purchasable", None)
        crop.pop("acquisition", None)

config["updated_at"] = "2026-09-27"
config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")

js = planner_path.read_text()
old_props = '''\t\tself.seed_source = "buy_all";\n\t\tself.paid_seed_count = 0;\n\t\tself.replant_same_source = true;\n\t\tself.replant_seed_source = "buy_all";\n\t\tself.replant_paid_seed_count = 0;\n'''
js = js.replace(old_props, "")
old_load = '''\t\t\tself.seed_source = data.seed_source || "buy_all";\n\t\t\tself.paid_seed_count = parseInt(data.paid_seed_count || 0);\n\t\t\tself.replant_same_source = data.replant_same_source !== false;\n\t\t\tself.replant_seed_source = data.replant_seed_source || "buy_all";\n\t\t\tself.replant_paid_seed_count = parseInt(data.replant_paid_seed_count || 0);\n'''
js = js.replace(old_load, "")
old_save = '''    data.seed_source = this.seed_source || "buy_all";\n    if (this.seed_source == "mixed") data.paid_seed_count = this.get_paid_seed_count(false);\n    data.replant_same_source = this.replant_same_source !== false;\n    if (this.replant_same_source === false){\n        data.replant_seed_source = this.replant_seed_source || "buy_all";\n        if (this.replant_seed_source == "mixed") data.replant_paid_seed_count = this.get_paid_seed_count(true);\n    }\n'''
js = js.replace(old_save, "")
start = js.index("\tPlan.prototype.get_paid_seed_count = function(replant){")
end = js.index("\tPlan.prototype.get_revenue = function", start)
new_cost = '''\t// All purchasable seeds default to Buy all. Seeds that cannot be purchased\n\t// with Gold have buy=0 in config, so exchanges/free sources add no Gold cost.\n\tPlan.prototype.get_cost = function(locale){\n\t\tvar crop_price = this.crop && this.crop.buy ? this.crop.buy : 0;\n\t\tvar amount = crop_price * Math.max(0, parseInt(this.amount || 0));\n\t\tif (locale) return amount.toLocaleString();\n\t\treturn amount;\n\t};\n\t\n'''
js = js[:start] + new_cost + js[end:]
old_gold = '''\t\t\tvar crop = self.crops[self.newplan.crop_id];\n\t\t\tif (!crop) return;\n\t\t\tamount = Math.floor(gold / crop.buy);\n'''
new_gold = '''\t\t\tvar crop = self.crops[self.newplan.crop_id];\n\t\t\tif (!crop) return;\n\t\t\tif (!crop.buy){\n\t\t\t\talert("This seed has no Gold purchase price. Enter a quantity instead.");\n\t\t\t\treturn false;\n\t\t\t}\n\t\t\tamount = Math.floor(gold / crop.buy);\n'''
js = js.replace(old_gold, new_gold)
planner_path.write_text(js)

html = index_path.read_text()
html = html.replace('scripts/planner.js?v=teabush2-20260922', 'scripts/planner.js?v=gold-seed-costs-20260927')
start_marker = '\t\t\t\t\t\t\t<div class="col-md-12 col-xs-12 seed-source-options" style="margin-top:12px;">'
end_marker = '\t\t\t\t\t\t\t<div class="col-md-12 col-xs-12 plant-actions">'
start = html.index(start_marker)
end = html.index(end_marker, start)
cost_summary = '''\t\t\t\t\t\t\t<div class="col-md-12 col-xs-12" style="margin-top:12px;">\n\t\t\t\t\t\t\t\t<div class="text-muted" ng-show="self.newplan.crop_id && self.crops[self.newplan.crop_id].buy">Seed cost defaults to Buy all: {{self.newplan.get_cost(1)}}g</div>\n\t\t\t\t\t\t\t\t<div class="text-muted" ng-show="self.newplan.crop_id && !self.crops[self.newplan.crop_id].buy">No Gold seed cost — this item is not sold for Gold or uses an exchange source.</div>\n\t\t\t\t\t\t\t</div>\n\n'''
html = html[:start] + cost_summary + html[end:]
html = html.replace('\n\t\t\t\t\t\t\t<th class="mobile-hide">Paid Seeds</th>', '')
html = html.replace('\n\t\t\t\t\t\t\t<td class="mobile-hide">{{plan.get_paid_seed_count()}}/{{plan.amount}} · {{plan.get_seed_source_label()}}</td>', '')
html = html.replace('<td>{{crop.buy}}g</td>', '<td>{{crop.buy ? (crop.buy + \'g\') : \'No Gold cost\'}}</td>')
html = html.replace('<td>{{self.sidebar.crop.buy}}g</td>', '<td>{{self.sidebar.crop.buy ? (self.sidebar.crop.buy + \'g\') : \'Not sold for Gold\'}}</td>')
html = html.replace('Last updated: March 8, 2026', 'Last updated: September 27, 2026')
index_path.write_text(html)

# Ensure the one-time migration changed every intended surface.
assert "seed-source-options" not in html
assert "get_paid_seed_count" not in js
assert all(crops[c]["buy"] == 0 for c in zero_gold)
assert crops["rice_shoot"]["buy"] == 40
