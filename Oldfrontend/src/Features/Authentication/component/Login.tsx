// colors
// import { colors } from '../../../style';

//ICON
import { KeyOutlined, MailOutlined } from '@ant-design/icons';

// components
import SubmitButton from './SubmitButton';

// hook
import { useLoginForm } from '../hook/useLoginForm';


interface LoginProps {
    onSuccess?: (accessToken: string) => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess }) => {
    const { 
        loginInfo, 
        btnState, 
        errorMess, 
        onChanges, 
        onSubmit 
    } = useLoginForm({ onSuccess });

    return (
        <form onSubmit={onSubmit} className={`select-none flex flex-col items-center gap-6 w-full px-5`}>
            <div className="w-full flex items-center gap-3 border-b border-zinc-300 dark:border-zinc-700 focus-within:border-zinc-900 dark:focus-within:border-white transition-colors">
                <MailOutlined className='text-zinc-400 text-lg' />
                <input
                    type="email"
                    name="email"
                    onChange={onChanges}
                    value={loginInfo.email}
                    placeholder="Email"
                    className="flex-1 bg-transparent py-3 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
                />
            </div>

            <div className="w-full flex items-center gap-3 border-b border-zinc-300 dark:border-zinc-700 focus-within:border-zinc-900 dark:focus-within:border-white transition-colors">
                <KeyOutlined className='text-zinc-400 text-lg' />
                <input
                    type="password"
                    name="password"
                    onChange={onChanges}
                    value={loginInfo.password}
                    placeholder="Password"
                    className="flex-1 bg-transparent py-3 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
                />
            </div>

            <p className="text-red-500 min-h-[1.5rem] text-sm">{errorMess || '\u00A0'}</p>

            <div className='w-full'>
                <SubmitButton btnState={btnState} />
            </div>
        </form>
    );
};

export default Login;
