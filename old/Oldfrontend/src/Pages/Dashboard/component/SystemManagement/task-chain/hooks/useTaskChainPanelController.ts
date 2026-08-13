import { useEffect, useState } from 'react';
import { message } from 'antd';

import {
    useCreateMissionListMutation,
    useDeleteMissionListMutation,
    useDeleteMissionNodeMutation,
    useLazyGetSystemListQuery,
    useUpdateMissionListMutation,
} from '../../../../../../api/systemRtkApi';
import type { MissionList } from '../../../../../../Types/System';
import { normalizeAttributeKey } from '../../../../../../shared/core/protagonistAttributeProgression';
import { createInitialListForm, type TaskListFormState } from '../taskChainForms';
import type { EditableNode } from '../../TaskFormModal';

type DeleteTarget = { id: string; title: string; nodeCount: number } | null;
type MissionNode = MissionList['taskTree'][number];

type UseTaskChainPanelControllerArgs = {
    systemId: string;
    missionLists: MissionList[];
};

const buildListPayload = (form: TaskListFormState) => {
    const unlockAttributeKey = form.unlockType === 'attributeLevel'
        ? normalizeAttributeKey(form.unlockAttributeName)
        : null;

    return {
        listType: form.listType,
        title: form.title.trim(),
        description: form.description.trim(),
        unlockCondition: {
            type: form.unlockType,
            attributeName: unlockAttributeKey,
            minLevel: form.unlockType === 'attributeLevel' ? Math.max(0, form.unlockMinLevel) : 0,
        },
        failureMechanism: {
            enabled: form.failureEnabled,
            pointPenalty: form.failureEnabled && form.pointPenaltyAttributeName.trim()
                ? [{
                    attributeName: form.pointPenaltyAttributeName.trim(),
                    value: Math.max(1, form.pointPenaltyValue),
                }]
                : [],
            itemPenalty: form.failureEnabled && form.itemPenaltyItemKey
                ? [{
                    itemKey: form.itemPenaltyItemKey,
                    quantity: Math.max(1, form.itemPenaltyQuantity),
                }]
                : [],
        },
    };
};

export const useTaskChainPanelController = ({
    systemId,
    missionLists,
}: UseTaskChainPanelControllerArgs) => {
    const [selectedMissionListId, setSelectedMissionListId] = useState('');
    const [showListForm, setShowListForm] = useState(false);
    const [showEditListForm, setShowEditListForm] = useState(false);
    const [showNodeForm, setShowNodeForm] = useState(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [nodeParentAnchor, setNodeParentAnchor] = useState('');
    const [editingNode, setEditingNode] = useState<EditableNode | undefined>(undefined);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
    const [listForm, setListForm] = useState<TaskListFormState>(createInitialListForm);
    const [editListForm, setEditListForm] = useState<TaskListFormState>(createInitialListForm);

    const [triggerGetSystemList, { isLoading }] = useLazyGetSystemListQuery();
    const [createMissionList, { isLoading: isCreatingList }] = useCreateMissionListMutation();
    const [updateMissionList, { isLoading: isUpdatingList }] = useUpdateMissionListMutation();
    const [deleteMissionList, { isLoading: isDeletingList }] = useDeleteMissionListMutation();
    const [deleteMissionNode, { isLoading: isDeletingNode }] = useDeleteMissionNodeMutation();

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        if (!selectedMissionListId && missionLists.length > 0) {
            setSelectedMissionListId(missionLists[0]._id);
        }
    }, [missionLists, selectedMissionListId]);

    const selectedMissionList = missionLists.find((list) => list._id === selectedMissionListId);

    const resetListForm = () => {
        setListForm(createInitialListForm());
    };

    const fillEditListForm = (missionList: MissionList) => {
        setEditListForm({
            listType: missionList.listType,
            title: missionList.title || '',
            description: missionList.description || '',
            unlockType: missionList.unlockCondition?.type === 'attributeLevel' ? 'attributeLevel' : 'direct',
            unlockAttributeName: normalizeAttributeKey(missionList.unlockCondition?.attributeName) || '',
            unlockMinLevel: Number(missionList.unlockCondition?.minLevel || 0),
            failureEnabled: !!missionList.failureMechanism?.enabled,
            pointPenaltyAttributeName: missionList.failureMechanism?.pointPenalty?.[0]?.attributeName || '',
            pointPenaltyValue: Number(missionList.failureMechanism?.pointPenalty?.[0]?.value || 1),
            itemPenaltyItemKey: missionList.failureMechanism?.itemPenalty?.[0]?.itemKey || '',
            itemPenaltyQuantity: Number(missionList.failureMechanism?.itemPenalty?.[0]?.quantity || 1),
        });
    };

    const handleCreateMissionList = async () => {
        if (!listForm.title.trim()) {
            message.error('请填写任务列表标题');
            return;
        }
        if (listForm.unlockType === 'attributeLevel' && !normalizeAttributeKey(listForm.unlockAttributeName)) {
            message.error('请选择解锁所需属性');
            return;
        }

        try {
            const response = await createMissionList({
                systemId,
                ...buildListPayload(listForm),
            }).unwrap() as { missionList?: MissionList };
            message.success('任务列表创建成功');
            setShowListForm(false);
            resetListForm();
            await triggerGetSystemList().unwrap();
            if (response?.missionList?._id) {
                setSelectedMissionListId(response.missionList._id);
            }
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务列表创建失败');
        }
    };

    const openEditMissionListModal = () => {
        if (!selectedMissionList) {
            message.warning('请先选择任务列表');
            return;
        }
        fillEditListForm(selectedMissionList);
        setShowEditListForm(true);
    };

    const handleUpdateMissionList = async () => {
        if (!selectedMissionList) {
            message.error('请先选择任务列表');
            return;
        }
        if (!editListForm.title.trim()) {
            message.error('请填写任务列表标题');
            return;
        }
        if (editListForm.unlockType === 'attributeLevel' && !normalizeAttributeKey(editListForm.unlockAttributeName)) {
            message.error('请选择解锁所需属性');
            return;
        }

        try {
            await updateMissionList({
                systemId,
                missionListId: selectedMissionList._id,
                ...buildListPayload(editListForm),
            }).unwrap();
            message.success('任务列表已更新');
            setShowEditListForm(false);
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务列表更新失败');
        }
    };

    const handleRequestDeleteMissionList = (listId: string, title: string, nodeCount: number) => {
        setDeleteTarget({ id: listId, title, nodeCount });
    };

    const handleConfirmDeleteMissionList = async () => {
        if (!deleteTarget) return;
        const { id, title } = deleteTarget;
        setDeleteTarget(null);
        setShowEditListForm(false);

        try {
            await deleteMissionList({ systemId, missionListId: id }).unwrap();
            message.success(`已删除任务列表「${title}」及其所有任务`);
            if (selectedMissionListId === id) {
                setSelectedMissionListId('');
            }
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务列表删除失败');
        }
    };

    const handleDeleteMissionNode = async (nodeId: string) => {
        if (!selectedMissionList) return;

        const taskTree = selectedMissionList.taskTree || [];
        const targetNode = taskTree.find((node: MissionNode) => node.nodeId === nodeId);
        if (!targetNode) return;

        const isRoot = selectedMissionList.rootNodeId === nodeId;
        const childCount = targetNode.childrenNodeIds?.length ?? 0;

        const collectSubtreeIds = (rootId: string): string[] => {
            const ids: string[] = [];
            const queue = [rootId];
            while (queue.length > 0) {
                const current = queue.shift()!;
                ids.push(current);
                const node = taskTree.find((item: MissionNode) => item.nodeId === current);
                if (node) {
                    queue.push(...node.childrenNodeIds);
                }
            }
            return ids;
        };

        let confirmMessage = `确认删除节点「${targetNode.title}」？\n\n`;
        if (isRoot && childCount > 0) {
            const newRootNode = taskTree.find((node: MissionNode) => node.nodeId === targetNode.childrenNodeIds[0]);
            const newRootTitle = newRootNode?.title ?? targetNode.childrenNodeIds[0];
            confirmMessage += `该节点是根节点，「${newRootTitle}」将成为新的根节点。`;
            if (childCount > 1) {
                const slotsAvailable = 3 - (newRootNode?.childrenNodeIds?.length ?? 0);
                const cascadeCount = childCount - 1 - slotsAvailable;
                if (cascadeCount > 0) {
                    const cascadeSubtreeSize = targetNode.childrenNodeIds
                        .slice(1 + slotsAvailable)
                        .flatMap((id: string) => collectSubtreeIds(id)).length;
                    confirmMessage += `\n\n⚠️ 新根节点已无多余子节点槽位，${cascadeSubtreeSize} 个节点将被级联删除。`;
                }
            }
        } else if (!isRoot && childCount > 0) {
            const parentNode = taskTree.find((node: MissionNode) => node.nodeId === targetNode.parentNodeId);
            const slotsAvailable = parentNode ? 3 - (parentNode.childrenNodeIds.length - 1) : 0;
            const cascadeCount = Math.max(0, childCount - slotsAvailable);
            if (cascadeCount > 0) {
                const cascadeSubtreeSize = targetNode.childrenNodeIds
                    .slice(slotsAvailable)
                    .flatMap((id: string) => collectSubtreeIds(id)).length;
                confirmMessage += `子节点会尽量拼接到父节点，但父节点槽位不足，${cascadeSubtreeSize} 个节点将被级联删除。`;
            } else {
                confirmMessage += `该节点的 ${childCount} 个子节点将拼接到父节点下。`;
            }
        } else {
            confirmMessage += '此操作不可撤销。';
        }

        if (!window.confirm(confirmMessage)) return;

        try {
            const response = await deleteMissionNode({
                systemId,
                missionListId: selectedMissionList._id,
                nodeId,
            }).unwrap() as { deletedNodeIds?: string[] };
            const deletedCount = response.deletedNodeIds?.length ?? 1;
            message.success(`节点已删除（共移除 ${deletedCount} 个节点）`);
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '节点删除失败');
        }
    };

    const openCreateNodeForm = (parentNodeId = '') => {
        setNodeParentAnchor(parentNodeId);
        setEditingNode(undefined);
        setShowNodeForm(true);
    };

    const openEditNodeForm = (node: EditableNode) => {
        setEditingNode(node);
        setNodeParentAnchor('');
        setShowNodeForm(true);
    };

    const closeNodeForm = () => {
        setShowNodeForm(false);
        setNodeParentAnchor('');
        setEditingNode(undefined);
    };

    return {
        deleteTarget,
        editListForm,
        editingNode,
        handleConfirmDeleteMissionList,
        handleCreateMissionList,
        handleDeleteMissionNode,
        handleRequestDeleteMissionList,
        handleUpdateMissionList,
        isCreatingList,
        isDeletingList,
        isDeletingNode,
        isLoading,
        isUpdatingList,
        listForm,
        nodeParentAnchor,
        openCreateNodeForm,
        openEditMissionListModal,
        openEditNodeForm,
        resetListForm,
        selectedMissionList,
        selectedMissionListId,
        setDeleteTarget,
        setEditListForm,
        setListForm,
        setSelectedMissionListId,
        setShowAiModal,
        setShowEditListForm,
        setShowListForm,
        showAiModal,
        showEditListForm,
        showListForm,
        showNodeForm,
        closeNodeForm,
        setSelectedMissionListFromCreated: setSelectedMissionListId,
    };
};
