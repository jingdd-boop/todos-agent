import type { AgentModel, ChatMessage } from "../../src/agent/assistant";

export type ScriptedResponse = ChatMessage;

export function scriptedModel(responses: ScriptedResponse[], model = "fake-deepseek") {
  let index = 0;
  const calls: ChatMessage[][] = [];
  const run: AgentModel = async (messages) => {
    calls.push(messages.map((message) => ({ ...message })));
    const response = responses[index];
    index += 1;
    if (!response) throw new Error("Fake LLM script exhausted");
    return { assistant: { ...response, content: response.content ?? "" }, model };
  };
  return { run, calls };
}
