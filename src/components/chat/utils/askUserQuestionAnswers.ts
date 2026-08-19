/**
 * Pulls the chosen answers out of an AskUserQuestion tool result.
 *
 * The answers only reach `input.answers` when this app hosted the prompt itself
 * and wrote them back. A conversation held in the editor or the CLI arrives as a
 * transcript where the questions are in the input and the answers are in the
 * result, phrased by the SDK as:
 *
 *   The user answered: "question"="answer", "question"="answer". Read the ...
 *
 * Without this the questions render as an untouched set of options, which reads
 * as though nothing was ever answered.
 */
const ANSWER_PAIR = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"/g;

const unescape = (value: string) => value.replace(/\\(["\\])/g, '$1');

export function parseAnswersFromToolResult(content: unknown): Record<string, string> {
  const text = typeof content === 'string' ? content : '';
  if (!text.includes('The user answered')) return {};

  const answers: Record<string, string> = {};
  // Reading from the marker onwards keeps the trailing guidance sentence, which
  // contains no quoted pairs, from contributing anything.
  const body = text.slice(text.indexOf('The user answered'));
  for (const match of body.matchAll(ANSWER_PAIR)) {
    const question = unescape(match[1]).trim();
    const answer = unescape(match[2]).trim();
    if (question && answer) answers[question] = answer;
  }
  return answers;
}
