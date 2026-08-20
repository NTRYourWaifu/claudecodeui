export type CodeEditorDiffInfo = {
  old_string?: string;
  new_string?: string;
  [key: string]: unknown;
};

export type CodeEditorFile = {
  name: string;
  path: string;
  // DB projectId; used by the editor to build `/api/projects/:projectId/file`
  // URLs for reading and saving content.
  projectId?: string;
  // Set to 'computer' when the file was opened from the file tree's machine scope,
  // which reads and writes through `/api/fs/*` by absolute path instead.
  scope?: 'project' | 'computer';
  diffInfo?: CodeEditorDiffInfo | null;
  [key: string]: unknown;
};

export type CodeEditorSettingsState = {
  isDarkMode: boolean;
  wordWrap: boolean;
  minimapEnabled: boolean;
  showLineNumbers: boolean;
  fontSize: string;
};
