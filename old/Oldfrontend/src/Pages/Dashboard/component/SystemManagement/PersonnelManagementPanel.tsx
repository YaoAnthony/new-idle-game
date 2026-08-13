import React from 'react';
import { FaBell, FaUsers } from 'react-icons/fa';

import type { SystemMemberSummary } from '../../../../Types/System';
import { useGetSystemMembersQuery } from '../../../../api/systemRtkApi';

export type PersonnelEventItem = {
    id: string;
    text: string;
    time: string;
    type: string;
};

const resolveMemberUser = (member: SystemMemberSummary) => {
    return typeof member.user === 'object' && member.user ? member.user : null;
};

const resolveMemberName = (member: SystemMemberSummary, index: number) => {
    const user = resolveMemberUser(member);
    return user?.username || user?.email || `成员 ${index + 1}`;
};

const resolveMemberAvatar = (member: SystemMemberSummary) => {
    const user = resolveMemberUser(member);
    return user?.image_url || null;
};

const resolveJoinedAt = (value?: string) => {
    if (!value) return '加入时间未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '加入时间未知';
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} 加入`;
};

const getMemberKey = (member: SystemMemberSummary, index: number) => {
    return String(
        (typeof member.user === 'object' && member.user?._id) ||
        member.user ||
        member.profile ||
        member._id ||
        index
    );
};

type PersonnelManagementPanelProps = {
    systemId: string;
    events: PersonnelEventItem[];
    onClearEvents: () => void;
};

const PersonnelManagementPanel: React.FC<PersonnelManagementPanelProps> = ({
    systemId,
    events,
    onClearEvents,
}) => {
    const {
        data: memberData,
        isLoading: isLoadingMembers,
        isError: isMemberLoadError,
    } = useGetSystemMembersQuery({ systemId });
    const members = memberData?.members || [];

    return (
        <div className="system-people-panel">
            <div className="system-people-grid">
                <section className="system-people-card system-people-card--members">
                    <header className="system-info-card-header system-info-card-header--with-count">
                        <span>
                            <FaUsers />
                            <h2>加入成员</h2>
                        </span>
                        <b>{members.length}</b>
                    </header>

                    {isLoadingMembers ? (
                        <p className="system-info-muted">成员载入中...</p>
                    ) : isMemberLoadError ? (
                        <p className="system-info-muted">成员信息暂时无法读取。</p>
                    ) : members.length === 0 ? (
                        <div className="system-people-empty">
                            <FaUsers />
                            <strong>暂无成员加入</strong>
                            <span>复制系统 ID 分享给玩家后，成员会显示在这里。</span>
                        </div>
                    ) : (
                        <div className="system-member-list system-member-list--people">
                            {members.map((member, index) => {
                                const name = resolveMemberName(member, index);
                                const avatar = resolveMemberAvatar(member);

                                return (
                                    <div className="system-member-item" key={getMemberKey(member, index)}>
                                        <div className="system-member-avatar">
                                            {avatar ? (
                                                <img src={avatar} alt="" />
                                            ) : (
                                                <span>{name.slice(0, 1).toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div className="system-member-copy">
                                            <strong>{name}</strong>
                                            <small>{resolveJoinedAt(member.joinedAt)}</small>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="system-people-card system-people-card--events">
                    <header className="system-info-card-header system-info-card-header--with-count">
                        <span>
                            <FaBell />
                            <h2>成员实时事件</h2>
                        </span>
                        {events.length > 0 && (
                            <button
                                type="button"
                                onClick={onClearEvents}
                                className="system-management-event-clear"
                            >
                                清空
                            </button>
                        )}
                    </header>

                    {events.length === 0 ? (
                        <div className="system-people-empty">
                            <FaBell />
                            <strong>暂无事件</strong>
                            <span>成员接取、开始、完成、购买或抽卡后，会实时记录在这里。</span>
                        </div>
                    ) : (
                        <div className="system-management-event-list system-management-event-list--people">
                            {events.map((eventItem) => (
                                <div key={eventItem.id} className="system-management-event-item">
                                    <span>{eventItem.text}</span>
                                    <time>{eventItem.time}</time>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default PersonnelManagementPanel;
