/** This is a necessary scope check, not semantic annotation or proof of clean.
 * A path mismatch proves the published review patch and the engine input differ.
 * Matching paths alone never establishes matching hunks or the absence of bugs.
 */
export function sourceReviewPaths(candidate,reviewedSha) {
 if(candidate.source==='ccrab_retained') {
  let commit=candidate.source_record.commit_to_review;
  if(typeof commit==='string')commit=JSON.parse(commit);
  if(commit?.head_commit!==reviewedSha||typeof commit.patch_to_review!=='string')return null;
  const rows=commit.patch_to_review.split('\n').filter(s=>s.startsWith('diff --git '));
  // Quoted/renamed paths need manual comparison; never infer their decoding.
  const matches=rows.map(s=>/^diff --git a\/(.+) b\/\1$/.exec(s));
  if(!matches.length||matches.some(m=>!m))return null;
  return [...new Set(matches.map(m=>m[1]))].sort();
 }
 if(candidate.source==='swrbench') {
  let commits=candidate.source_record.pr_commits;
  if(typeof commits==='string')commits=JSON.parse(commits);
  if(!Array.isArray(commits)||commits.length!==1||commits[0].sha!==reviewedSha||!Array.isArray(commits[0].diff))return null;
  const paths=commits[0].diff.map(d=>d.file);
  return paths.length&&paths.every(p=>typeof p==='string')?[...new Set(paths)].sort():null;
 }
 return null;
}
export function compareSourceScope(candidate,reviewedSha,actualChangedPaths) {
 const expected=sourceReviewPaths(candidate,reviewedSha);
 if(!expected)return {status:'unknown',reason:'Published review scope cannot be derived safely; manual audit required'};
 const actual=[...new Set(actualChangedPaths)].sort();
 const extraPaths=actual.filter(p=>!expected.includes(p)),missingPaths=expected.filter(p=>!actual.includes(p));
 return {status:extraPaths.length||missingPaths.length?'mismatch':'paths_match_requires_hunk_and_semantic_audit',expectedPaths:expected,actualPaths:actual,extraPaths,missingPaths};
}
