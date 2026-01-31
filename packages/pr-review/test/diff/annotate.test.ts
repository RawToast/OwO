import { describe, expect, test } from "bun:test"
import { annotateDiffWithLineNumbers } from "../../src/diff/annotate"

describe("diff/annotate", () => {
  describe("annotateDiffWithLineNumbers", () => {
    test("annotates a simple diff with additions, deletions, and context", () => {
      const input = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,5 +1,6 @@
 line1
+new line
 line2
-old line
 line3`

      const expected = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,5 +1,6 @@
R1|  line1
R2| +new line
R3|  line2
L3| -old line
R4|  line3`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("annotates multiple hunks correctly", () => {
      const input = `diff --git a/multi.ts b/multi.ts
--- a/multi.ts
+++ b/multi.ts
@@ -10,3 +10,4 @@
 context1
+added1
 context2
@@ -50,2 +51,3 @@
 context3
+added2`

      const expected = `diff --git a/multi.ts b/multi.ts
--- a/multi.ts
+++ b/multi.ts
@@ -10,3 +10,4 @@
R10|  context1
R11| +added1
R12|  context2
@@ -50,2 +51,3 @@
R51|  context3
R52| +added2`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("handles only additions", () => {
      const input = `diff --git a/add.ts b/add.ts
--- a/add.ts
+++ b/add.ts
@@ -5,0 +5,3 @@
+line1
+line2
+line3`

      const expected = `diff --git a/add.ts b/add.ts
--- a/add.ts
+++ b/add.ts
@@ -5,0 +5,3 @@
R5| +line1
R6| +line2
R7| +line3`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("handles only deletions", () => {
      const input = `diff --git a/del.ts b/del.ts
--- a/del.ts
+++ b/del.ts
@@ -10,3 +10,0 @@
-removed1
-removed2
-removed3`

      const expected = `diff --git a/del.ts b/del.ts
--- a/del.ts
+++ b/del.ts
@@ -10,3 +10,0 @@
L10| -removed1
L11| -removed2
L12| -removed3`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("handles hunk headers with optional function context", () => {
      const input = `diff --git a/func.ts b/func.ts
--- a/func.ts
+++ b/func.ts
@@ -215,10 +224,121 @@ export function myFunction() {
 context
+added`

      const expected = `diff --git a/func.ts b/func.ts
--- a/func.ts
+++ b/func.ts
@@ -215,10 +224,121 @@ export function myFunction() {
R224|  context
R225| +added`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("handles diff with no hunks (binary file, etc.)", () => {
      const input = `diff --git a/binary.png b/binary.png
Binary files a/binary.png and b/binary.png differ`

      const expected = `diff --git a/binary.png b/binary.png
Binary files a/binary.png and b/binary.png differ`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("handles multiple files in diff", () => {
      const input = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,3 @@
 a
+b
 c
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -5,1 +5,2 @@
 x
+y`

      const expected = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,3 @@
R1|  a
R2| +b
R3|  c
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -5,1 +5,2 @@
R5|  x
R6| +y`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("handles hunk header without count (single line change)", () => {
      const input = `diff --git a/single.ts b/single.ts
--- a/single.ts
+++ b/single.ts
@@ -5 +5 @@
-old
+new`

      const expected = `diff --git a/single.ts b/single.ts
--- a/single.ts
+++ b/single.ts
@@ -5 +5 @@
L5| -old
R5| +new`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("returns empty string for empty input", () => {
      expect(annotateDiffWithLineNumbers("")).toBe("")
    })

    test("handles new file creation", () => {
      const input = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+line1
+line2
+line3`

      const expected = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
R1| +line1
R2| +line2
R3| +line3`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })

    test("handles file deletion", () => {
      const input = `diff --git a/deleted.ts b/deleted.ts
deleted file mode 100644
--- a/deleted.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2
-line3`

      const expected = `diff --git a/deleted.ts b/deleted.ts
deleted file mode 100644
--- a/deleted.ts
+++ /dev/null
@@ -1,3 +0,0 @@
L1| -line1
L2| -line2
L3| -line3`

      expect(annotateDiffWithLineNumbers(input)).toBe(expected)
    })
  })
})
