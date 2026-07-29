// Minimal line-level diff (LCS) — no dependencies. Returns an array of rows:
//   { type: "ctx" | "add" | "del", text, aLine, bLine }
// aLine/bLine are 1-based line numbers (null on the side where the line is absent).

function lcsTable(a, b) {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

export function diffLines(oldText, newText) {
  const a = (oldText || "").split("\n");
  const b = (newText || "").split("\n");
  const dp = lcsTable(a, b);
  const rows = [];
  let i = 0;
  let j = 0;
  let aLine = 1;
  let bLine = 1;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: "ctx", text: a[i], aLine: aLine++, bLine: bLine++ });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "del", text: a[i], aLine: aLine++, bLine: null });
      i++;
    } else {
      rows.push({ type: "add", text: b[j], aLine: null, bLine: bLine++ });
      j++;
    }
  }
  while (i < a.length) rows.push({ type: "del", text: a[i++], aLine: aLine++, bLine: null });
  while (j < b.length) rows.push({ type: "add", text: b[j++], aLine: null, bLine: bLine++ });
  return rows;
}

// Compare two file maps. Returns per-file status + counts, sorted with changed
// files first. status: "added" | "removed" | "changed" | "unchanged".
export function diffFileMaps(oldFiles = {}, newFiles = {}) {
  const names = Array.from(
    new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)])
  ).sort();
  const result = names.map((name) => {
    const before = oldFiles[name];
    const after = newFiles[name];
    let status;
    if (before == null) status = "added";
    else if (after == null) status = "removed";
    else if (before === after) status = "unchanged";
    else status = "changed";

    let added = 0;
    let removed = 0;
    let rows = [];
    if (status === "changed") {
      rows = diffLines(before, after);
      for (const r of rows) {
        if (r.type === "add") added++;
        else if (r.type === "del") removed++;
      }
    } else if (status === "added") {
      added = (after || "").split("\n").length;
    } else if (status === "removed") {
      removed = (before || "").split("\n").length;
    }
    return { name, status, added, removed, rows };
  });

  const rank = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  result.sort((x, y) => rank[x.status] - rank[y.status] || x.name.localeCompare(y.name));
  return result;
}
