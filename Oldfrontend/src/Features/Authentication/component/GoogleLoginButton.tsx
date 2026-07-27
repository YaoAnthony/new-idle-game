import { GoogleLogin } from '@react-oauth/google';
import { useDispatch } from 'react-redux';
import { setToken, setUser } from '../../../Redux/Features/userSlice';
import { useGoogleLoginMutation } from '../../../api/authApi';

interface Props {
  onSuccess?: () => void; 
}

const GoogleLoginButton: React.FC<Props> = ({ onSuccess }) => {

  const dispatch = useDispatch();
  const [googleLoginApi] = useGoogleLoginMutation();

  return (
    <div className="w-full flex justify-center">
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          try {
            // get id_token from credentialResponse
            const id_token = credentialResponse.credential;
            if (!id_token) {
              throw new Error('Google credential is undefined');
            }

            // call googleLoginApi with id_token
            const { accessToken, expiresAt, user } = await googleLoginApi({ id_token }).unwrap();
            console.log('Google Login Success:', { accessToken, expiresAt, user });
            // save token and user to redux store
            dispatch(setToken({ accessToken, expiresAt }));
            dispatch(setUser(user));

            if (onSuccess) {
              onSuccess(); 
            } 
          } catch (err) {
            console.error('Google Login Failed:', err);
          }
        }}
        onError={() => {
          console.log('Google Login Failed');
        }}
        
        useOneTap={false}
        theme="filled_black"
        text="continue_with"
        shape="pill"
        width={280}
      />
    </div>
  );
};

export default GoogleLoginButton;
