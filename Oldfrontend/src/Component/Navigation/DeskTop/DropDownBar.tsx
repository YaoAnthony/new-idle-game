//react
import React from 'react';

//redux
import { useDispatch } from 'react-redux';
import { logout as localLogout } from '../../../Redux/Features/userSlice';

//router
import { useNavigate,useLocation,NavLink } from 'react-router-dom';

//antd
import { message } from 'antd';

//motion
import { motion } from 'framer-motion';
import { dropDown } from '../../../Motion';

//icons
import { 
    KeyOutlined,
    PlaySquareOutlined,
    ReadOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import { IoIosLogOut } from "react-icons/io";

//types
import { User } from '../../../Types/User';

//redux
import { useSelector } from 'react-redux';
import { useLogoutMutation } from '../../../api/authApi';

type DropDownBarProps = {
    onRequestClose?: () => void;
};

const DropDownBar: React.FC<DropDownBarProps> = ({ onRequestClose }) => {
    //hook
    const user = useSelector((state: { user: { user: User; }; }) => state.user.user);
    const dispatch = useDispatch();
    const navigate = useNavigate(); //navigate to other page
    const location = useLocation(); //get the path
    

    // logout api
    const [ logout ] = useLogoutMutation();


    //Sign out action
    const handleSignOut =  () => {
        
        console.log('sign out')
        //call logout api
        logout();
        //clear the redux state
        dispatch(localLogout());
        
        // cehck the path
        if (location.pathname.startsWith('/dashboard/')) {
            
            navigate('/');
        }

        onRequestClose?.();
        message.success("You have successfully logged out")
    }


    const itemStyle = 'desktop-dropdown-item';


    const ListButton = ({to,title,icon}: {to: string, title: string, icon: React.ReactNode}) => {

        return(
            <NavLink to={to} onClick={onRequestClose}>
                <motion.button
                    className={itemStyle}
                    whileTap={{ scale: 0.95 }}
                    variants={dropDown.itemVariants}
                >
                    {icon}
                    {title}
                </motion.button>
            </NavLink>
        )
    }

    return(
        <motion.div
            className="desktop-dropdown-menu h-auto min-w-[360px] px-6 py-5 rounded-[10px] select-none"
            style={{
                background: 'linear-gradient(180deg, rgba(18, 21, 31, 0.98), rgba(9, 11, 17, 0.98))',
                border: '1px solid rgba(238, 221, 173, 0.28)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                color: 'var(--px-text)',
            }}
            variants={dropDown.containerVariants}
            initial="closed"
            animate={"open"}
        >
            <style>
                {`
                    .desktop-dropdown-menu a {
                        color: inherit;
                        text-decoration: none;
                    }

                    .desktop-dropdown-item {
                        width: 100%;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 20px;
                        border: 0;
                        border-radius: 6px;
                        background: transparent;
                        color: #f7f0df;
                        font-size: 1rem;
                        font-weight: 700;
                        text-align: left;
                        white-space: nowrap;
                        transition: background 0.15s ease, color 0.15s ease;
                    }

                    .desktop-dropdown-item:hover,
                    .desktop-dropdown-item:focus-visible {
                        background: rgba(255, 255, 255, 0.1);
                        color: #f1d890;
                        outline: none;
                    }

                    .desktop-dropdown-item svg {
                        color: currentColor;
                    }
                `}
            </style>
            <h1 className='text-center w-full text-xl my-5' style={{ color: '#f1d890' }}>Hi, {user.username}</h1>
            <ListButton to="/dashboard/idle-game" title={'游戏'} icon={<PlaySquareOutlined />}/>
            <ListButton to="/dashboard/storyline-editor" title={'剧情编辑器'} icon={<ReadOutlined />}/>
            <ListButton to="/dashboard/setting/my" title={'系统管理'} icon={<SettingOutlined />}/>
            <ListButton to="/apiToken?next=/dashboard/idle-game" title={'API Key 设置'} icon={<KeyOutlined />}/>
            <div className="my-2 border-t border-[rgba(238,221,173,0.22)]" />
            <motion.button
                className={itemStyle}
                whileTap={{ scale: 0.95 }}
                variants={dropDown.itemVariants}
                onClick={handleSignOut}
            >
                <IoIosLogOut />
                退出登录
            </motion.button>

        </motion.div>
    )
}


export default DropDownBar;
