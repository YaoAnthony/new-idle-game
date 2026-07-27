import type { MissionListType } from '../../../../../Types/System';
import type { AttributeKey } from '../../../../../shared/core/protagonistAttributeProgression';

export type TaskRewardItemOption = {
    key: string;
    label: string;
    source: 'store' | 'obtainable';
};

export type TaskListFormState = {
    listType: MissionListType;
    title: string;
    description: string;
    unlockType: 'direct' | 'attributeLevel';
    unlockAttributeName: AttributeKey | '';
    unlockMinLevel: number;
    failureEnabled: boolean;
    pointPenaltyAttributeName: string;
    pointPenaltyValue: number;
    itemPenaltyItemKey: string;
    itemPenaltyQuantity: number;
};

export const createInitialListForm = (): TaskListFormState => ({
    listType: 'mainline',
    title: '',
    description: '',
    unlockType: 'direct',
    unlockAttributeName: '',
    unlockMinLevel: 0,
    failureEnabled: false,
    pointPenaltyAttributeName: '',
    pointPenaltyValue: 1,
    itemPenaltyItemKey: '',
    itemPenaltyQuantity: 1,
});
