# Prompt: generate a lesson

How to use: copy everything below the line into a chat with the AI. Replace the values in the
"Lesson request" table first. The AI answers with one JSON file. Check it, save it as
`content/lessons/<pair>/<lesson-id>.json` and run `validate`.

The "Schema" section is a copy of `content/schema/lesson.schema.json`. If the schema changes,
paste the new version here as well (a test for this is planned in the content pipeline plan, task 3).

---

You write the text for one lesson of a listening-and-repeating app. The lesson is a short
conversation. The learner hears one sentence at a time in the language they are learning, repeats it
aloud, then hears what it means. They repeat every sentence, whoever says it in the conversation. They
learn while walking, with the screen locked, so every sentence must be easy to hear, remember and say.

## Lesson request

| Item | Value |
|---|---|
| Language being learned (`target_lang`) | fr (French) |
| Explanation language (`meaning_lang`) | en (English) |
| Lesson id | lesson-02 |
| Situation | Buying fruit at a market |
| The two speakers | a = Customer (the learner's side), b = Seller |
| Persona (made-up name of speaker a) | Marc |
| Number of sentences (a target, not an exact count: see rule 3) | 8 |
| Learner level | Complete beginner |
| Register and accent | vous (polite), France French |

## Rules for the sentences

1. **Short.** For a complete beginner, 3 to 5 words per sentence. Longer sentences are hard to repeat. If the learner level is higher, keep each sentence easy to say in one breath.
2. **Spoken, natural language.** Write what a real person says in this situation, not textbook or written style. Use the register and accent from the request, and keep them the same in the whole lesson.
3. **One real conversation.** The sentences form a single conversation about the situation in the request, in the order they are played. Each sentence answers or continues the one before it, the way two real people talk: a greeting, a request, a reply, a follow-up question, an answer, a thank you. Start with the opening of the conversation and end where it naturally ends. Put the most useful sentences early. The number of sentences in the request is a target, not an exact count: use a few more or fewer when the conversation needs it, so that it sounds natural and polite. For example, if a person receives something, they thank for it, and a polite conversation ends with a thank you or a goodbye. Never add filler just to reach the number, and never cut a sentence that real people would say.
4. **Two speakers.** Give every sentence a `speaker` (`a` or `b`) and name the two roles in `speakers`, in the explanation language, using the roles from the request. Speaker `a` is the learner's side and is the persona. The speakers take turns where the situation calls for it; one speaker may say two sentences in a row. If the request asks for a monologue instead (one person talking, no other speaker), leave out `speakers` and every `speaker`, and still make each sentence follow from the one before. Never mix: either all sentences have a speaker or none.
5. **Written for a voice.** The text is read by a speech engine. Write numbers as words, and do not use digits, abbreviations, symbols or emoji. Use normal punctuation (commas, full stops, question marks), because the voice uses it for rhythm.
6. **Meaning.** Write it in the explanation language: natural and faithful to the sentence, not word for word.
7. **Phrases (optional).** Add `phrases` only to a sentence that has a natural pause, usually after a comma, and split there. Use 2 to 4 pieces. Joined together (ignoring spaces) the pieces must be exactly the `target` text: no word added, removed or reworded, no punctuation changed. Leave `phrases` out of short sentences with no natural pause.
8. **No repeats.** Do not repeat a sentence. Each sentence says something new and moves the conversation forward. Do not add any field that is not in the schema.
9. **Title.** The title is in the explanation language. Do not write a closing sentence for the lesson; the app adds a standard one.
10. **Optional fields.** Include `persona`, `register` and `accent` only if they apply to the target language; leave out the ones that do not.

## Output format

- Reply with **one JSON file** in a single code block, and nothing else inside the block.
- It must follow the schema below exactly: only the listed fields, correct types, no comments, no trailing commas. Sentence ids are `s01`, `s02`, ... in playing order.
- `schema_version` is always `1`.
- After the code block, you may add a short list of anything you are unsure about (for example a doubtful phrasing), so a native speaker can check it. Do not add notes inside the JSON.

## Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "lesson.schema.json",
  "title": "Lesson text file",
  "description": "The text of one lesson, a short conversation written by an AI and approved by the user. It holds no audio settings (speed, pauses); those live in the tuning file.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "id", "target_lang", "meaning_lang", "title", "sentences"],
  "properties": {
    "schema_version": {
      "description": "Version of this contract. Always 1.",
      "const": 1
    },
    "id": {
      "description": "Lesson id, also the file name without .json.",
      "type": "string",
      "pattern": "^lesson-[0-9]{2,}$"
    },
    "target_lang": {
      "description": "Language code of the language being learned (the sentences in `target`), for example fr.",
      "type": "string",
      "pattern": "^[a-z]{2,3}$"
    },
    "meaning_lang": {
      "description": "Language code of the explanation language (the sentences in `meaning`), for example en. Must differ from target_lang.",
      "type": "string",
      "pattern": "^[a-z]{2,3}$"
    },
    "title": {
      "description": "Short title of the lesson, written in the meaning language.",
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "persona": {
      "description": "Optional. First name of the made-up person the learner stands in for (speaker a, if the sentences have speakers).",
      "type": "string",
      "minLength": 1,
      "maxLength": 40
    },
    "speakers": {
      "description": "Optional. The two roles of a conversation, written in the meaning language, for example a = Customer and b = Seller. Present if and only if the sentences have a `speaker`.",
      "type": "object",
      "additionalProperties": false,
      "required": ["a", "b"],
      "properties": {
        "a": {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        },
        "b": {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        }
      }
    },
    "register": {
      "description": "Optional. Level of politeness of the target language, for example vous or tu in French. Only for languages that have the distinction.",
      "type": "string",
      "minLength": 1,
      "maxLength": 40
    },
    "accent": {
      "description": "Optional. Regional variety of the target language, for example France French.",
      "type": "string",
      "minLength": 1,
      "maxLength": 40
    },
    "sentences": {
      "description": "The sentences of the lesson, in the order they are played.",
      "type": "array",
      "minItems": 1,
      "maxItems": 30,
      "items": { "$ref": "#/$defs/sentence" }
    }
  },
  "$defs": {
    "sentence": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "target",
        "meaning"
      ],
      "properties": {
        "id": {
          "description": "Sentence id, unique in the lesson: s01, s02, ...",
          "type": "string",
          "pattern": "^s[0-9]{2,}$"
        },
        "speaker": {
          "description": "Optional. Who says the sentence: a or b, as named in `speakers`. Give it to every sentence or to none.",
          "enum": [
            "a",
            "b"
          ]
        },
        "target": {
          "description": "The sentence in the language being learned, as it is spoken.",
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "meaning": {
          "description": "The same sentence in the meaning language, natural rather than word for word.",
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "phrases": {
          "description": "Optional. A suggestion for splitting `target` at natural pauses. Joined together (ignoring spaces) the pieces must equal `target` exactly.",
          "type": "array",
          "minItems": 2,
          "maxItems": 4,
          "items": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

## Example of the format

This only shows the format. Do not reuse its sentences or its situation.

```json
{
  "schema_version": 1,
  "id": "lesson-02",
  "target_lang": "fr",
  "meaning_lang": "en",
  "title": "Order a coffee",
  "persona": "Marc",
  "register": "vous",
  "accent": "France French",
  "speakers": { "a": "Customer", "b": "Waiter" },
  "sentences": [
    {
      "id": "s01",
      "speaker": "a",
      "target": "Bonjour, je voudrais un café.",
      "meaning": "Hello, I would like a coffee.",
      "phrases": ["Bonjour,", "je voudrais un café."]
    },
    {
      "id": "s02",
      "speaker": "b",
      "target": "Bien sûr. Autre chose ?",
      "meaning": "Of course. Anything else?"
    },
    {
      "id": "s03",
      "speaker": "a",
      "target": "Oui, un croissant, s'il vous plaît.",
      "meaning": "Yes, a croissant, please.",
      "phrases": ["Oui, un croissant,", "s'il vous plaît."]
    },
    {
      "id": "s04",
      "speaker": "b",
      "target": "Voilà. Ça fait trois euros.",
      "meaning": "Here you are. That is three euros."
    },
    {
      "id": "s05",
      "speaker": "a",
      "target": "Je peux payer par carte ?",
      "meaning": "Can I pay by card?"
    }
  ]
}
```
