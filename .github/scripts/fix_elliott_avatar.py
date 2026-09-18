from pathlib import Path

old = '''\t\treturn "images/people/" + this.name.toLowerCase() + ".png";'''
new = '''\t\tvar image_name = this.name.toLowerCase();
\t\t// The bundled portrait asset keeps the original one-t filename.
\t\tif (image_name == "elliott") image_name = "elliot";
\t\treturn "images/people/" + image_name + ".png";'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()
    if 'if (image_name == "elliott") image_name = "elliot";' not in text:
        if old not in text:
            raise SystemExit(f"Calendar avatar anchor missing in {filename}")
        text = text.replace(old, new, 1)
    path.write_text(text)

index_path = Path("index.html")
html = index_path.read_text()
old_src = './scripts/planner.js?v=forageevents-20260918'
new_src = './scripts/planner.js?v=elliottavatar-20260918'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Planner cache key anchor missing")
    html = html.replace(old_src, new_src, 1)
index_path.write_text(html)

assert Path("images/people/elliot.png").exists()
assert 'if (image_name == "elliott") image_name = "elliot";' in Path("scripts/planner.js").read_text()
assert new_src in index_path.read_text()
print("Elliott now uses the bundled elliot.png portrait.")
