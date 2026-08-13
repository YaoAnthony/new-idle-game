//RTK Query
import { 
    createApi, 
    fetchBaseQuery,
    FetchBaseQueryError
} from "@reduxjs/toolkit/query/react";


//types
import { 
    Credentials,
    LoginResponse,
    RegisterResponse,
    GoogleLoginRequest,
    GoogleLoginResponse,
    GithubLoginRequest,
    GithubLoginResponse,
} from "../Features/Authentication/types";

//env
import { getEnv } from "../config/env";

const { backendUrl } = getEnv();  

export const authApi = createApi({
    reducerPath: "authApi",
    baseQuery: fetchBaseQuery({ 
        baseUrl: backendUrl as string , 
        credentials: 'include'
    }),
    endpoints: (builder) => ({
        /**
         *  This is Login api, send the email and password to the backend, and get the token
         *  
         * If using OAuth2, the state will be passed to the backend, and the backend will return the token
         * 
         *  If the login is successful, the token will be returned
         *  If the login is failed, the error will be returned. e.g. {status: 401, error: "The email and password is not matched."}
         *  @param email
         *  @param password
         *  @returns string
         *  @throws FetchBaseQueryError
         * 
         */
        login: builder.mutation<LoginResponse, Credentials>({
            queryFn: async (body, _queryApi, _extraOptions, baseQuery) => {
                
                const response = await baseQuery({
                    url: "/auth/login",
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    method: "POST",
                    body,
                })
                if (response.error) {
                    return { 
                        error: {
                            status: response.error.status,
                            error: response.error.data,
                        } as FetchBaseQueryError,
                    };
                }
                return { data: response.data as LoginResponse };
            },

            invalidatesTags: () => [],
            //invalidatesTags: (result, error, arg) => (result ? [] : []),
        }),
        /**
         * This is Register api, send the email, password and username to the backend, and get the token
         * If the register is successful, the token will be returned
         * If the register is failed, the error will be returned. 
         * e.g. {status: 401, error: "Email is exist."}
         * 
         * @param email
         * @param password
         * @param username
         * @returns AuthToken
         * @throws FetchBaseQueryError
         * 
         */
        register: builder.mutation<RegisterResponse, Credentials>({
          queryFn: async (body, _queryApi, _extraOptions, baseQuery) => {
                
                const response = await baseQuery({
                    url: '/auth/register',
                    method: 'POST',
              body,
                });
                if (response.error) {
                    return { error: { status: response.error.status, error: response.error.data } as FetchBaseQueryError };
                }
        
                return { data: response.data as RegisterResponse };
            },
            invalidatesTags: () => [],
        }),


        //Google login
        googleLogin: builder.mutation<GoogleLoginResponse, GoogleLoginRequest>({
            queryFn: async ({ id_token }, _queryApi, _extraOptions, baseQuery) => {
              const response = await baseQuery({
                url: "/auth/google",
                method: "POST",
                headers: {
                  'Content-Type': 'application/json',
                },
                body: { id_token },
              });
          
              if (response.error) {
                return {
                  error: {
                    status: response.error.status,
                    error: response.error.data,
                  } as FetchBaseQueryError,
                };
              }
          
              return {
                data: response.data as GoogleLoginResponse,
              };
            },
            invalidatesTags: () => [],
        }),

        githubLogin: builder.mutation<GithubLoginResponse, GithubLoginRequest>({
            queryFn: async ({ code }, _queryApi, _extraOptions, baseQuery) => {
              const response = await baseQuery({
                url: "/auth/github",
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: { code },
              });
          
              if (response.error) {
                return {
                  error: {
                    status: response.error.status,
                    error: response.error.data,
                  } as FetchBaseQueryError,
                };
              }
          
              return { data: response.data as GithubLoginResponse };
            },
          
            invalidatesTags: () => [],
        }), 

        // logout
        logout: builder.mutation<void, void>({

            query: () => ({
                url: '/auth/logout',
                method: 'POST',
            }),
            invalidatesTags: () => [],
        }),
    }),

    
});




export const { 
    useLoginMutation, 
    useRegisterMutation,

    useGoogleLoginMutation,
    useGithubLoginMutation,

    useLogoutMutation,
    
} = authApi;