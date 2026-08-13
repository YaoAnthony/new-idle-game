import Modal from "../../../Component/Modal";

import { useState } from "react";
import { useNavigate } from "react-router-dom";

// constants
import { APPNAME } from "../../../Constant";

import Login from "./Login";
import Register from "./Register";
import GoogleLoginButton from "./GoogleLoginButton";
import GithubLoginButton from "./GithubLoginButton";
import FeatureList from "./FeatureList";

import { colors } from "../../../style";
import { setToken } from "../../../Redux/Features/userSlice";

// redux
import { useDispatch } from "react-redux";
import { useLazyGetProfileAndUserQuery } from "../../../api/profileApi";

//import { useTranslation } from "react-i18next";

interface ModalAuthProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

const ModalAuth: React.FC<ModalAuthProps> = ({ isOpen, onClose, onSuccess  }) => {
    const [isLogin, setIsLogin] = useState(true);
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();

    const handleSuccess = async () => {
        // 4) 立刻拉取用户信息（依赖上面的 token）
        try {
            // 这里里面其实已经dispatch 了 setProfile 和 setUser，所以外层不需要再 dispatch 一次
            await triggerGetProfileAndUser().unwrap();
        } catch (err) {
            console.error("Failed to load profile:", err);
            // 失败时清空 Redux token（与存储策略统一）
            dispatch(setToken({ accessToken: "", expiresAt: 0 }));
        }
                
        onClose();
        if (onSuccess) {
            onSuccess();
        } else {
            navigate('/dashboard/idle-game');
        }
    }

    const GoogleLogin = () => {
        return (
            <div className='w-64'>
                <GoogleLoginButton onSuccess={handleSuccess} />
            </div>
        )
    }

    const GithubLogin = () => {
        return (
            <div className='w-64'>
                <GithubLoginButton onSuccess={handleSuccess} />
            </div>
        )
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
        >
            <div className={`flex ${colors.text.primary} w-full justify-center items-start gap-12 md:mx-8 my-24`}>
                
                <div className='relative w-96 h-full hidden md:flex flex-col justify-start items-center gap-4 font-mono '>

                    <p className="text-3xl"> Join us for <span className="text-success " >free</span> </p>
                    <p className="text-xl"> Unlock the following services </p>
                    <FeatureList />
                </div>


                <div className='flex justify-center items-center flex-col gap-4 md:border-l md:pl-10 md:mr-12'>
                    <div className='w-full flex justify-center flex-col items-center gap-7'>
                        <p className='text-3xl'>{isLogin ? `Sign to ${APPNAME}` : `Register to ${APPNAME}`}</p>
                        {isLogin ? <Login onSuccess={handleSuccess} /> : <Register onSuccess={handleSuccess} />}
                    </div>
                    <div className="w-full flex flex-col items-center gap-5">
                        <div className='flex justify-center gap-4 text-sm'>
                            <p className='select-none'>{isLogin ? "Don't have an account?" : "Already has account?"}</p>
                            <button className="text-blue-500 hover:underline" onClick={() => setIsLogin(!isLogin)}>
                                {isLogin ? "Create your now." : "Login."}
                            </button>
                            
                        </div>
                        <GoogleLogin />
                        <GithubLogin />
                    </div>

                </div>
            </div>
            
        </Modal>
    )
}


export default ModalAuth;
