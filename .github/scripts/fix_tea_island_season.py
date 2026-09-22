from pathlib import Path

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()

    current_old = '''\t\t\t\t\tvar final_season = farm.greenhouse ? 3 : 2;
\t\t\t\t\tfor (var tea_season = 0; tea_season <= final_season; tea_season++){'''
    current_new = '''\t\t\t\t\tvar tea_location = plan.location || (farm.greenhouse ? "greenhouse" : "farm");
\t\t\t\t\tvar final_season = tea_location === "greenhouse" ? 3 : 2;
\t\t\t\t\tfor (var tea_season = 0; tea_season <= final_season; tea_season++){'''
    if current_new not in text:
        if current_old not in text:
            raise SystemExit(f"Current-year Tea location anchor missing in {filename}")
        text = text.replace(current_old, current_new, 1)

    carry_old = '''\t\t\t\t\t\tvar final_season = farm.greenhouse ? 3 : 2;
\t\t\t\t\t\tfor (var season_index = 0; season_index <= final_season; season_index++){'''
    carry_new = '''\t\t\t\t\t\tvar final_season = location === "greenhouse" ? 3 : 2;
\t\t\t\t\t\tfor (var season_index = 0; season_index <= final_season; season_index++){'''
    if carry_new not in text:
        if carry_old not in text:
            raise SystemExit(f"Carry-over Tea location anchor missing in {filename}")
        text = text.replace(carry_old, carry_new, 1)

    path.write_text(text)

index_path = Path("index.html")
html = index_path.read_text()
old_src = './scripts/planner.js?v=teabush-20260922'
new_src = './scripts/planner.js?v=teabush2-20260922'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Tea Bush cache key anchor missing")
    html = html.replace(old_src, new_src, 1)
index_path.write_text(html)

for filename in ("scripts/planner.js", "planner.js"):
    text = Path(filename).read_text()
    assert 'tea_location === "greenhouse" ? 3 : 2' in text
    assert 'location === "greenhouse" ? 3 : 2' in text
assert new_src in index_path.read_text()
print("Winter Tea harvests are limited to the Greenhouse, not outdoor Ginger Island.")
