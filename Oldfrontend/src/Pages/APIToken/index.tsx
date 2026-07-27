import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { message } from "antd";
import { FaCheckCircle, FaKey, FaSave, FaShieldAlt, FaTrash, FaVial } from "react-icons/fa";

import Navbar from "../../Component/Navigation/Navbar";
import {
    ApiTokenConfigResponse,
    ApiTokenRouteConfig,
    SaveApiTokenConfigRequest,
    useGetApiTokenConfigQuery,
    useSaveApiTokenConfigMutation,
    useTestApiTokenProviderMutation,
} from "../../api/apiTokenApi";
import "./APIToken.css";

type ProviderForm = {
    enabled: boolean;
    baseURL: string;
    model: string;
    apiKey: string;
    clearApiKey: boolean;
};

type ProviderForms = Record<string, ProviderForm>;
type RoutingForms = Record<string, ApiTokenRouteConfig>;

const createProviderForms = (data: ApiTokenConfigResponse | undefined): ProviderForms => {
    const result: ProviderForms = {};
    for (const provider of data?.catalog.providers || []) {
        const saved = data?.config.providers[provider.id];
        result[provider.id] = {
            enabled: saved?.enabled ?? true,
            baseURL: saved?.baseURL || provider.baseURL || "",
            model: saved?.model || provider.defaultModel || "",
            apiKey: "",
            clearApiKey: false,
        };
    }
    return result;
};

const createRoutingForms = (data: ApiTokenConfigResponse | undefined): RoutingForms => {
    const result: RoutingForms = {};
    for (const useCase of data?.catalog.useCases || []) {
        const saved = data?.config.routing[useCase.id];
        result[useCase.id] = {
            provider: saved?.provider || "",
            model: saved?.model || "",
        };
    }
    return result;
};

const APIToken: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nextPath = searchParams.get("next") || "/dashboard/idle-game";

    const { data, isError, isLoading, refetch } = useGetApiTokenConfigQuery();
    const [saveConfig, { isLoading: isSaving }] = useSaveApiTokenConfigMutation();
    const [testProvider, { isLoading: isTesting }] = useTestApiTokenProviderMutation();

    const [providerForms, setProviderForms] = useState<ProviderForms>({});
    const [routingForms, setRoutingForms] = useState<RoutingForms>({});

    useEffect(() => {
        if (!data) return;
        setProviderForms(createProviderForms(data));
        setRoutingForms(createRoutingForms(data));
    }, [data]);

    const missingLabels = useMemo(() => {
        if (!data?.status.missingUseCases.length) return [];
        const labels = new Map(data.catalog.useCases.map((useCase) => [useCase.id, useCase.label]));
        return data.status.missingUseCases.map((id) => labels.get(id) || id);
    }, [data]);

    const updateProvider = (providerId: string, patch: Partial<ProviderForm>) => {
        setProviderForms((current) => ({
            ...current,
            [providerId]: {
                ...current[providerId],
                ...patch,
            },
        }));
    };

    const updateRoute = (useCaseId: string, patch: Partial<ApiTokenRouteConfig>) => {
        setRoutingForms((current) => ({
            ...current,
            [useCaseId]: {
                ...current[useCaseId],
                ...patch,
            },
        }));
    };

    const buildSavePayload = (): SaveApiTokenConfigRequest => {
        const providers: SaveApiTokenConfigRequest["providers"] = {};
        for (const [providerId, form] of Object.entries(providerForms)) {
            providers[providerId] = {
                enabled: form.enabled,
                baseURL: form.baseURL.trim(),
                model: form.model.trim(),
                ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
                ...(form.clearApiKey ? { clearApiKey: true } : {}),
            };
        }
        return {
            providers,
            routing: routingForms,
        };
    };

    const handleSave = async () => {
        try {
            await saveConfig(buildSavePayload()).unwrap();
            message.success("模型配置已保存");
            await refetch();
            navigate(nextPath, { replace: true });
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || "保存失败");
        }
    };

    const handleProviderTest = async (providerId: string) => {
        try {
            const form = providerForms[providerId];
            await testProvider({
                provider: providerId,
                model: form?.model,
                providerConfig: {
                    apiKey: form?.apiKey.trim() || undefined,
                    baseURL: form?.baseURL.trim(),
                    model: form?.model.trim(),
                },
            }).unwrap();
            message.success("连接测试成功");
            await refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || "连接测试失败");
        }
    };

    return (
        <div className="api-token-page">
            <div className="api-token-bg" />
            <header className="api-token-navbar">
                <Navbar />
            </header>

            <main className="api-token-shell">
                <section className="api-token-header">
                    <div>
                        <span className="api-token-kicker">LOCAL LLM ROUTER</span>
                        <h1><FaShieldAlt /> API Token</h1>
                    </div>
                    <div className={data?.status.configured ? "api-token-status is-ready" : "api-token-status"}>
                        <FaCheckCircle />
                        <span>{data?.status.configured ? "CONFIGURED" : "SETUP REQUIRED"}</span>
                    </div>
                </section>

                {isLoading ? (
                    <div className="api-token-empty">Loading...</div>
                ) : isError ? (
                    <div className="api-token-empty">
                        无法加载模型配置，请确认后端 `/api/token/config` 接口可用。
                    </div>
                ) : (
                    <>
                        {missingLabels.length > 0 && (
                            <div className="api-token-warning">
                                未完成：{missingLabels.join("、")}
                            </div>
                        )}

                        <section className="api-token-grid">
                            {(data?.catalog.providers || []).map((provider) => {
                                const form = providerForms[provider.id];
                                const saved = data?.config.providers[provider.id];
                                if (!form) return null;
                                return (
                                    <article className="api-token-provider" key={provider.id}>
                                        <div className="api-token-provider-head">
                                            <div>
                                                <span>{provider.label}</span>
                                                <small>{saved?.keySource === "environment" ? "ENV" : saved?.apiKeyPreview || "NO KEY"}</small>
                                            </div>
                                            <label className="api-token-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={form.enabled}
                                                    onChange={(event) => updateProvider(provider.id, { enabled: event.target.checked })}
                                                />
                                                <span />
                                            </label>
                                        </div>

                                        <label className="api-token-field">
                                            <span>API Key</span>
                                            <div className="api-token-input-row">
                                                <FaKey />
                                                <input
                                                    type="password"
                                                    value={form.apiKey}
                                                    placeholder={saved?.hasApiKey ? "已保存，留空不覆盖" : "sk-..."}
                                                    onChange={(event) => updateProvider(provider.id, {
                                                        apiKey: event.target.value,
                                                        clearApiKey: false,
                                                    })}
                                                />
                                                <button
                                                    type="button"
                                                    title="清除"
                                                    onClick={() => updateProvider(provider.id, { apiKey: "", clearApiKey: true })}
                                                >
                                                    <FaTrash />
                                                </button>
                                            </div>
                                        </label>

                                        <label className="api-token-field">
                                            <span>Base URL</span>
                                            <input
                                                value={form.baseURL}
                                                onChange={(event) => updateProvider(provider.id, { baseURL: event.target.value })}
                                            />
                                        </label>

                                        <label className="api-token-field">
                                            <span>Default Model</span>
                                            <input
                                                value={form.model}
                                                onChange={(event) => updateProvider(provider.id, { model: event.target.value })}
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            className="api-token-test"
                                            disabled={isTesting || isSaving || !form.enabled}
                                            onClick={() => handleProviderTest(provider.id)}
                                        >
                                            <FaVial /> Test
                                        </button>
                                    </article>
                                );
                            })}
                        </section>

                        <section className="api-token-routing">
                            <div className="api-token-section-title">Model Routing</div>
                            {(data?.catalog.useCases || []).map((useCase) => {
                                const route = routingForms[useCase.id] || { provider: "", model: "" };
                                return (
                                    <div className="api-token-route" key={useCase.id}>
                                        <div className="api-token-route-copy">
                                            <strong>{useCase.label}</strong>
                                            <span>{useCase.description}</span>
                                        </div>
                                        <select
                                            value={route.provider}
                                            onChange={(event) => updateRoute(useCase.id, { provider: event.target.value })}
                                        >
                                            <option value="">自动选择</option>
                                            {(data?.catalog.providers || []).map((provider) => (
                                                <option value={provider.id} key={provider.id}>{provider.label}</option>
                                            ))}
                                        </select>
                                        <input
                                            value={route.model}
                                            placeholder="使用 provider 默认模型"
                                            onChange={(event) => updateRoute(useCase.id, { model: event.target.value })}
                                        />
                                    </div>
                                );
                            })}
                        </section>

                        <footer className="api-token-actions">
                            <button
                                type="button"
                                className="api-token-save"
                                disabled={isSaving}
                                onClick={handleSave}
                            >
                                <FaSave /> {isSaving ? "Saving..." : "Save"}
                            </button>
                        </footer>
                    </>
                )}
            </main>
        </div>
    );
};

export default APIToken;
