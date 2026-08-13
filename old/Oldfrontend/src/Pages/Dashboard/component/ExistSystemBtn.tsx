
import { FaSignOutAlt } from "react-icons/fa";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { message } from "antd";
import { useLazyGetSystemListQuery, useLeaveSystemMutation } from "../../../api/systemRtkApi";

const ExistSystemBtn = () => {

    const navigate = useNavigate();
    const { systemId } = useParams<{ systemId: string }>();
    const [leaveSystem, { isLoading }] = useLeaveSystemMutation();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();

    const handleExitSystem = async () => {
        if (!systemId) {
            message.error('缺少系统ID，无法退出系统');
            return;
        }

        try {
            await leaveSystem({ systemId }).unwrap();
            await triggerGetSystemList().unwrap();
            message.success('退出系统成功');
            navigate('/dashboard/idle-game');
        } catch (error) {
            console.error('Leave system error:', error);
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '退出系统失败');
        }
    };
    

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleExitSystem}
            disabled={isLoading}
            className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 px-4 py-2 rounded-lg font-bold tracking-wider transition-colors"
        >
            <FaSignOutAlt /> {isLoading ? '退出中...' : '退出系统'}
        </motion.button>
    )
}

export default ExistSystemBtn;
