// style
// import { colors } from '../../../style';

// components
import SubmitButton from './SubmitButton';

//ICON
import { KeyOutlined, MailOutlined  } from '@ant-design/icons';

//hook
import { useRegisterForm } from '../hook/useRegisterForm';

interface RegisterProps {
    onSuccess?: (accessToken: string) => void; // 可选回调：登录成功后的自定义行为
}

const Register: React.FC<RegisterProps> = ({ onSuccess }) => {

    
    const { values, btnState, errorMess, onChanges, onSubmit } = useRegisterForm({
        onSuccess,
        validate: (v) => {
        if (!v.email) return "Email is required.";
        if (!v.password) return "Password is required.";
        if ((v.confirmPassword ?? "") !== v.password) return "Passwords do not match.";
        // 还可以加强：密码长度/强度、邮箱格式等
        return undefined;
        },
    });

    return (
        <form onSubmit={onSubmit} className={`select-none flex flex-col items-center gap-6 w-full px-5`}>
            <div className="w-full flex items-center gap-3 border-b border-zinc-300 dark:border-zinc-700 focus-within:border-zinc-900 dark:focus-within:border-white transition-colors">
                <MailOutlined className='text-zinc-400 text-lg' />
                <input
                    type="email"
                    name="email"
                    onChange={onChanges}
                    value={values.email}
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
                    value={values.password}
                    placeholder="Password"
                    className="flex-1 bg-transparent py-3 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
                />
            </div>

            <div className="w-full flex items-center gap-3 border-b border-zinc-300 dark:border-zinc-700 focus-within:border-zinc-900 dark:focus-within:border-white transition-colors">
                <KeyOutlined className='text-zinc-400 text-lg' />
                <input
                    type="password"
                    name="confirmPassword"
                    onChange={onChanges}
                    value={values.confirmPassword}
                    placeholder="Confirm Password"
                    className="flex-1 bg-transparent py-3 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
                />
            </div>
            <p className="text-red-500 min-h-[1.5rem] self-start text-sm">{errorMess || '\u00A0'}</p>

            <SubmitButton btnState={btnState} />
        </form>
    );
}


export default Register;
