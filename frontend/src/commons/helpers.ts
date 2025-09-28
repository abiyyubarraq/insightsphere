// Generic async operation wrapper with loading state
export const withLoading = async (
  operation: () => Promise<any>,
  setLoading: (loading: boolean) => void,
  setError: (error: string) => void
) => {
  setLoading(true);
  setError('');
  try {
    return await operation();
  } catch (e: any) {
    setError(e.message);
    return null;
  } finally {
    setLoading(false);
  }
};
