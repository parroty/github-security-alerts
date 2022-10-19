import { reaction, when } from "mobx";
import {
  commands,
  CommentController,
  CommentMode,
  comments,
  CommentThreadCollapsibleState,
  Disposable,
  MarkdownString,
  Range,
  TextEditorSelectionChangeKind,
  Uri,
  window,
  workspace,
} from "vscode";
import { store } from "./store";

export function titleCase(str: string) {
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

let controller: CommentController | undefined;
let disposables: Disposable[] = [];

function clearAlertUI(closeFindWidget: boolean = false) {
  disposables.forEach((d) => d.dispose());
  disposables = [];

  if (closeFindWidget) {
    commands.executeCommand("closeFindWidget");
  }
}

export async function showFileWithAlert(
  number: number,
  alertType: "dependabot" | "code-scanning",
  path: string,
  summary: string,
  description: string | undefined | null,
  options: { search?: string; selection?: Range }
) {
  clearAlertUI(!options.search);

  const fileUri = Uri.joinPath(workspace.workspaceFolders![0].uri, path);

  // Open the file and force it to seek
  // to the first line before searching.
  const editor = await window.showTextDocument(fileUri, {
    selection: options.selection || new Range(0, 0, 0, 0),
  });

  if (options.search) {
    await commands.executeCommand("editor.actions.findWithArgs", {
      searchString: options.search,
      matchWholeWord: true,
    });

    await commands.executeCommand("editor.action.nextMatchFindAction");

    options.selection = new Range(
      editor.selection.start.line,
      0,
      editor.selection.start.line,
      0
    );
  }

  controller = comments.createCommentController(
    "security-events.alert",
    "Security Events"
  );
  disposables.push(controller);
  store.visibleAlert = { number, type: alertType };

  const thread = controller.createCommentThread(fileUri, options.selection!, [
    {
      body: new MarkdownString(description || ""),
      mode: CommentMode.Preview,
      author: {
        name: summary,
        iconPath: Uri.parse(
          "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg"
        ),
      },
    },
  ]);

  thread.canReply = false;
  thread.collapsibleState = CommentThreadCollapsibleState.Expanded;
  thread.label = "GitHub security alert";

  disposables.push(
    window.onDidChangeVisibleTextEditors((e) => {
      if (!e.find((ed) => ed.document.uri.toString() === fileUri.toString())) {
        clearAlertUI(!options.search);
      }
    })
  );

  if (options.search) {
    disposables.push(
      window.onDidChangeTextEditorSelection((e) => {
        if (
          e.kind == TextEditorSelectionChangeKind.Command &&
          e.textEditor.document.uri.toString() === fileUri.toString()
        ) {
          thread.range = new Range(
            e.selections[0].start.line,
            0,
            e.selections[0].start.line,
            0
          );
        }
      })
    );
  }

  disposables.push({
    dispose: reaction(
      () => store.visibleAlert === undefined,
      () => clearAlertUI(!options.search)
    ),
  });
}
