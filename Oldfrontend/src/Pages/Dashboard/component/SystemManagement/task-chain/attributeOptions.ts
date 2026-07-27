import type { TFunction } from 'i18next';

import {
    ATTRIBUTE_KEYS,
    ATTRIBUTE_LABEL_BY_KEY,
    type AttributeKey,
} from '../../../../../shared/core/protagonistAttributeProgression';

export type TaskUnlockAttributeOption = {
    key: AttributeKey;
    label: string;
};

export const getTaskUnlockAttributeOptions = (t: TFunction): TaskUnlockAttributeOption[] => (
    ATTRIBUTE_KEYS.map((key) => ({
        key,
        label: t(`gameEsc.attributes.${key}`, {
            defaultValue: ATTRIBUTE_LABEL_BY_KEY[key] ?? key,
        }),
    }))
);
