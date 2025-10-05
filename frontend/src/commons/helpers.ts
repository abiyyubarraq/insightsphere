// Generic async operation wrapper with loading state
export const withLoading = async (
  operation: () => Promise<unknown>,
  setLoading: (loading: boolean) => void,
  setError: (error: string) => void
) => {
  setLoading(true);
  setError('');
  try {
    return await operation();
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
    setError(errorMessage);
    return null;
  } finally {
    setLoading(false);
  }
};
