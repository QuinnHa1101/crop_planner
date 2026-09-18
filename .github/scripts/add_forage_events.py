from pathlib import Path
import json

config_path = Path("config.json")
config = json.loads(config_path.read_text())

# Correct the canonical spelling.
for event in config["events"]["fall"]:
    if event.get("name") == "Elliot":
        event["name"] = "Elliott"

# Add fixed forage windows from the 1.6 calendar reference.
def add_window(season, name, days):
    events = config["events"][season]
    existing = {(e.get("day"), e.get("name")) for e in events}
    for day in days:
        if (day, name) not in existing:
            events.append({"day": day, "name": name, "forage": True})
    events.sort(key=lambda e: (e["day"], 0 if e.get("festival") else 1 if e.get("forage") else 2, e["name"]))

add_window("spring", "Salmonberry Season", range(15, 19))
add_window("fall", "Blackberry Season", range(8, 12))
config["updated_at"] = "2026-09-18"
config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")

old_event = '''\t\tself.name = "";
\t\tself.festival = false;'''
new_event = '''\t\tself.name = "";
\t\tself.festival = false;
\t\tself.forage = false;'''
old_load = '''\t\t\tself.name = data.name;
\t\t\tself.festival = data.festival;'''
new_load = '''\t\t\tself.name = data.name;
\t\t\tself.festival = !!data.festival;
\t\t\tself.forage = !!data.forage;'''
old_methods = '''\tCalendarEvent.prototype.get_image = function(){
\t\tif (this.festival) return "images/flag.gif";
\t\treturn "images/people/" + this.name.toLowerCase() + ".png";
\t};
\t
\t// Get readable text of event
\tCalendarEvent.prototype.get_text = function(){
\t\tif (!this.festival) return this.name + "'s Birthday";
\t\treturn this.name;
\t};'''
new_methods = '''\tCalendarEvent.prototype.get_image = function(){
\t\tif (this.festival) return "images/flag.gif";
\t\tif (this.forage) return "images/forage.svg";
\t\treturn "images/people/" + this.name.toLowerCase() + ".png";
\t};
\t
\t// Get readable text of event
\tCalendarEvent.prototype.get_text = function(){
\t\tif (this.festival || this.forage) return this.name;
\t\treturn this.name + "'s Birthday";
\t};'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()
    if "self.forage = false;" not in text:
        if old_event not in text:
            raise SystemExit(f"CalendarEvent property anchor missing in {filename}")
        text = text.replace(old_event, new_event, 1)
    if "self.forage = !!data.forage;" not in text:
        if old_load not in text:
            raise SystemExit(f"CalendarEvent load anchor missing in {filename}")
        text = text.replace(old_load, new_load, 1)
    if 'if (this.forage) return "images/forage.svg";' not in text:
        if old_methods not in text:
            raise SystemExit(f"CalendarEvent method anchor missing in {filename}")
        text = text.replace(old_methods, new_methods, 1)
    path.write_text(text)

index_path = Path("index.html")
html = index_path.read_text()
old_src = './scripts/planner.js?v=alwaysrecommend-20260918'
new_src = './scripts/planner.js?v=forageevents-20260918'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Planner cache key anchor missing")
    html = html.replace(old_src, new_src, 1)
index_path.write_text(html)

# Regression checks.
config = json.loads(config_path.read_text())
assert [(e["day"], e["name"]) for e in config["events"]["spring"] if e.get("forage")] == [
    (15, "Salmonberry Season"), (16, "Salmonberry Season"),
    (17, "Salmonberry Season"), (18, "Salmonberry Season")]
assert [(e["day"], e["name"]) for e in config["events"]["fall"] if e.get("forage")] == [
    (8, "Blackberry Season"), (9, "Blackberry Season"),
    (10, "Blackberry Season"), (11, "Blackberry Season")]
assert any(e["name"] == "Elliott" for e in config["events"]["fall"])
assert not any(e["name"] == "Elliot" for e in config["events"]["fall"])
print("Forage windows and Elliott spelling added.")
