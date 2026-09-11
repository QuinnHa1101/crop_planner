from pathlib import Path

OLD = '''\t\t// Update next year
\t\tif (full_update){
\t\t\tvar next_year = farm.year.next();
\t\t\tif (!next_year) return;
\t\t\tupdate(next_year, true);
\t\t}'''

NEW = '''\t\t// Update the same location bucket in the next year. Passing the Year
\t\t// object here used the current UI mode and accidentally redirected
\t\t// greenhouse/island updates to the main farm in Year 2+.
\t\tif (full_update){
\t\t\tvar next_year = farm.year.next();
\t\t\tif (!next_year) return;
\t\t\tvar next_farm = farm.greenhouse ? next_year.data.greenhouse : next_year.data.farm;
\t\t\tupdate(next_farm, true);
\t\t}'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()
    if NEW in text:
        continue
    if OLD not in text:
        raise SystemExit(f"Expected next-year update block not found in {filename}")
    path.write_text(text.replace(OLD, NEW, 1))

for filename in ("scripts/planner.js", "planner.js"):
    text = Path(filename).read_text()
    assert "var next_farm = farm.greenhouse ? next_year.data.greenhouse : next_year.data.farm;" in text
    assert "update(next_year, true);" not in text

print("Multi-year farm bucket propagation fixed.")
