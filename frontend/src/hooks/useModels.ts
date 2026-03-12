import { useState, useCallback } from "react";
import { apiFetch } from "../utils/api.ts";
import type { ModelInfo } from "../types.ts";

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelData, setModelData] = useState<Record<string, ModelInfo>>({});
  const [selectedModel, setSelectedModel] = useState("gpt-4.1");
  const [isLoading, setIsLoading] = useState(false);

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/models");
      if (!res.ok) {
        setModels([]);
        return;
      }
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        const modelMap: Record<string, ModelInfo> = {};
        const modelList: ModelInfo[] = [];
        for (const model of data.models) {
          const name = typeof model === "string" ? model : model.id || model.name;
          modelMap[name] = model;
          modelList.push({ ...model, id: name });
        }
        setModels(modelList);
        setModelData(modelMap);
        if (modelList.some((m) => m.id === "gpt-4.1")) {
          setSelectedModel("gpt-4.1");
        } else if (modelList.length > 0) {
          setSelectedModel(modelList[0].id || "");
        }
      }
    } catch {
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    models,
    modelData,
    selectedModel,
    setSelectedModel,
    isLoading,
    loadModels,
  };
}
