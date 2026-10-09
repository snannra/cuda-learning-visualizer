/* Application facade joins the notebook repository, model adapters and router. */
"use strict";
window.ExperimentNotebook =
  NotebookRepository.createNotebookRepository(StorageService);
ExperimentNotebook.capture = function (key) {
  try {
    return this.add(
      this.create(ExperimentAdapters.describe(key, PerformanceLab.states[key])),
    );
  } catch (error) {
    return { message: "Could not save: " + error.message, error: true };
  }
};
ExperimentNotebook.restore = function (record) {
  const restored = ExperimentAdapters.restore(NotebookRecords.validate(record));
  PerformanceLab.states[restored.key] = restored.state;
  PerformanceLab.save(restored.key);
  location.hash = restored.key;
};
